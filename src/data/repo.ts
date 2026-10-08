// Слой доступа к данным — единственное место, где живёт SQL.
//
// Запись подходов СРАЗУ обновляет накапливаемую модель силы (lift_model) —
// модель не пересобирается из таблицы sets при каждом запуске. Пересборка
// есть, но только явной кнопкой в Settings.

import { getDb } from "../db/client";
import { generateId } from "../lib/id";
import { LIFT_PRESETS, type Lift, type MuscleGroup, type Session, type SessionSize, type SetEntry } from "../lib/model.ts";
import { observeLift, sessionObservation, type StrengthModel } from "../lib/strength.ts";

/** Упражнения, которые по умолчанию входят в программу — сбалансированный стартовый набор. */
const DEFAULT_PROGRAM = ["squat", "bench", "deadlift", "row", "ohp", "pullup", "rdl", "lunge", "curl", "triceps", "face_pull", "plank"];

type LiftRow = {
  id: string;
  name: string;
  muscle_group: string;
  kind: string;
  increment: number;
  aliases: string;
  bodyweight: number;
  in_program: number;
  archived_at: string | null;
};

type SessionRow = { id: string; date: string; rpe: number | null; minutes: number | null; note: string };

type SetRow = { id: string; session_id: string; lift_id: string; weight: number; reps: number; rpe: number | null; ord: number };

type ModelRow = { lift_id: string; e1rm: number; variance: number; samples: number; last_at: string; best: number };

const toLift = (row: LiftRow): Lift => ({
  id: row.id,
  name: row.name,
  group: row.muscle_group as MuscleGroup,
  kind: row.kind === "compound" ? "compound" : "accessory",
  increment: row.increment,
  aliases: row.aliases ? row.aliases.split("|") : [],
  bodyweight: row.bodyweight === 1,
  inProgram: row.in_program === 1,
  archivedAt: row.archived_at,
});

const toSession = (row: SessionRow): Session => ({ id: row.id, date: row.date, rpe: row.rpe, minutes: row.minutes, note: row.note });

const toSet = (row: SetRow): SetEntry => ({
  id: row.id,
  sessionId: row.session_id,
  liftId: row.lift_id,
  weight: row.weight,
  reps: row.reps,
  rpe: row.rpe,
  order: row.ord,
});

/** Каталог упражнений при первом запуске. Повторный вызов ничего не дублирует. */
export async function ensureCatalog(): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) AS c FROM lifts;");
  if ((row?.c ?? 0) > 0) return;
  await db.withTransactionAsync(async () => {
    for (const preset of LIFT_PRESETS) {
      await db.runAsync(
        `INSERT INTO lifts (id, name, muscle_group, kind, increment, aliases, bodyweight, in_program, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL);`,
        [
          preset.key,
          preset.name,
          preset.group,
          preset.kind,
          preset.increment,
          preset.aliases.join("|"),
          preset.bodyweight ? 1 : 0,
          DEFAULT_PROGRAM.includes(preset.key) ? 1 : 0,
        ]
      );
    }
  });
}

export async function listLifts(): Promise<Lift[]> {
  const db = await getDb();
  return (await db.getAllAsync<LiftRow>("SELECT * FROM lifts ORDER BY name;")).map(toLift);
}

export async function saveLift(lift: Lift): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO lifts (id, name, muscle_group, kind, increment, aliases, bodyweight, in_program, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, muscle_group = excluded.muscle_group, kind = excluded.kind,
       increment = excluded.increment, aliases = excluded.aliases, bodyweight = excluded.bodyweight,
       in_program = excluded.in_program, archived_at = excluded.archived_at;`,
    [
      lift.id,
      lift.name,
      lift.group,
      lift.kind,
      lift.increment,
      lift.aliases.join("|"),
      lift.bodyweight ? 1 : 0,
      lift.inProgram ? 1 : 0,
      lift.archivedAt,
    ]
  );
}

export async function newLiftId(): Promise<string> {
  return `custom-${generateId()}`;
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDb();
  return (await db.getAllAsync<SessionRow>("SELECT * FROM sessions ORDER BY date DESC;")).map(toSession);
}

export async function listSets(): Promise<SetEntry[]> {
  const db = await getDb();
  return (await db.getAllAsync<SetRow>("SELECT * FROM sets ORDER BY ord;")).map(toSet);
}

/** Сессия дня: если на эту дату уже есть — возвращается она, иначе создаётся. */
export async function sessionForDate(date: string, existing: Session[]): Promise<Session> {
  const found = existing.find((item) => item.date === date);
  if (found) return found;
  const db = await getDb();
  const session: Session = { id: generateId(), date, rpe: null, minutes: null, note: "" };
  await db.runAsync("INSERT INTO sessions (id, date, rpe, minutes, note) VALUES (?, ?, NULL, NULL, '');", [session.id, date]);
  return session;
}

export async function updateSession(session: Session): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sessions SET rpe = ?, minutes = ?, note = ? WHERE id = ?;", [
    session.rpe,
    session.minutes,
    session.note,
    session.id,
  ]);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sets WHERE session_id = ?;", [id]);
  await db.runAsync("DELETE FROM sessions WHERE id = ?;", [id]);
}

async function persistModelRow(model: StrengthModel, liftId: string): Promise<void> {
  const row = model[liftId];
  if (!row) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO lift_model (lift_id, e1rm, variance, samples, last_at, best) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(lift_id) DO UPDATE SET e1rm = excluded.e1rm, variance = excluded.variance,
       samples = excluded.samples, last_at = excluded.last_at, best = excluded.best;`,
    [row.liftId, row.e1rm, row.variance, row.samples, row.lastAt, row.best]
  );
}

/**
 * Добавить подходы одной строки консоли и учесть их в модели силы.
 * Наблюдение для модели — лучший e1RM ИМЕННО ЭТИХ подходов: если в ту же
 * тренировку упражнение уже записывалось, модель получает ещё одно
 * наблюдение — честнее, чем делать вид, что первого не было.
 */
export async function addSets(
  session: Session,
  lift: Lift,
  entries: { weight: number; reps: number; rpe: number | null }[],
  nextOrder: number,
  model: StrengthModel,
  bodyweight: number
): Promise<{ sets: SetEntry[]; model: StrengthModel }> {
  const db = await getDb();
  const created: SetEntry[] = entries.map((entry, index) => ({
    id: generateId(),
    sessionId: session.id,
    liftId: lift.id,
    weight: entry.weight,
    reps: entry.reps,
    rpe: entry.rpe,
    order: nextOrder + index,
  }));
  // Без транзакции намеренно: две строки, отправленные подряд быстрее, чем
  // закончилась первая запись, давали бы вложенные транзакции и
  // "cannot rollback - no transaction is active" — ровно эту ошибку BlockDay
  // ловил на живом прогоне. Подходов в строке единицы, атомарность здесь не
  // стоит такого риска.
  for (const item of created) {
    await db.runAsync("INSERT INTO sets (id, session_id, lift_id, weight, reps, rpe, ord) VALUES (?, ?, ?, ?, ?, ?, ?);", [
      item.id,
      item.sessionId,
      item.liftId,
      item.weight,
      item.reps,
      item.rpe,
      item.order,
    ]);
  }
  const value = sessionObservation(created, lift, bodyweight);
  const next = value === null ? model : observeLift(model, lift.id, value, session.date);
  if (next !== model) await persistModelRow(next, lift.id);
  return { sets: created, model: next };
}

export async function deleteSet(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM sets WHERE id = ?;", [id]);
}

export async function updateSet(entry: SetEntry): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sets SET weight = ?, reps = ?, rpe = ? WHERE id = ?;", [entry.weight, entry.reps, entry.rpe, entry.id]);
}

export async function loadStrengthModel(): Promise<StrengthModel> {
  const db = await getDb();
  const rows = await db.getAllAsync<ModelRow>("SELECT * FROM lift_model;");
  const model: StrengthModel = {};
  for (const row of rows) {
    model[row.lift_id] = { liftId: row.lift_id, e1rm: row.e1rm, variance: row.variance, samples: row.samples, lastAt: row.last_at, best: row.best };
  }
  return model;
}

export async function replaceStrengthModel(model: StrengthModel): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM lift_model;");
  for (const liftId of Object.keys(model)) await persistModelRow(model, liftId);
}

export async function loadOverrides(): Promise<Record<string, SessionSize>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string; size: string }>("SELECT * FROM plan_overrides;");
  const out: Record<string, SessionSize> = {};
  for (const row of rows) out[row.date] = row.size as SessionSize;
  return out;
}

export async function setOverride(date: string, size: SessionSize | null): Promise<void> {
  const db = await getDb();
  if (size === null) {
    await db.runAsync("DELETE FROM plan_overrides WHERE date = ?;", [date]);
    return;
  }
  await db.runAsync(
    "INSERT INTO plan_overrides (date, size) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET size = excluded.size;",
    [date, size]
  );
}

export async function clearOverrides(): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM plan_overrides;");
}

export async function loadSettingsRaw(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>("SELECT * FROM settings;");
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function saveSettingRaw(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;", [key, value]);
}
