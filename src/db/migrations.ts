import type { SQLiteDatabase } from "expo-sqlite";

// Каждая миграция — одна ступень схемы. Не редактируй уже выпущенную миграцию —
// добавляй новую в конец массива. PRAGMA user_version хранит номер последней
// применённой ступени, миграции применяются последовательно от текущего значения.
const migrations: string[] = [
  `
  -- Упражнения: справочник (заполняется пресетами при первом запуске — это
  -- каталог, а не демо-записи) плюс пользовательские.
  CREATE TABLE IF NOT EXISTS lifts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    muscle_group TEXT NOT NULL,
    kind TEXT NOT NULL,
    increment REAL NOT NULL,
    aliases TEXT NOT NULL DEFAULT '',
    bodyweight INTEGER NOT NULL DEFAULT 0,
    in_program INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    date TEXT NOT NULL,
    rpe REAL,
    minutes INTEGER,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions (date);

  CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL,
    lift_id TEXT NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    rpe REAL,
    ord INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sets_session ON sets (session_id);
  CREATE INDEX IF NOT EXISTS idx_sets_lift ON sets (lift_id);

  -- Накапливаемая модель силы: строка на упражнение, обновляется каждой
  -- тренировкой и не пересобирается из sets при запуске.
  CREATE TABLE IF NOT EXISTS lift_model (
    lift_id TEXT PRIMARY KEY NOT NULL,
    e1rm REAL NOT NULL,
    variance REAL NOT NULL,
    samples INTEGER NOT NULL,
    last_at TEXT NOT NULL,
    best REAL NOT NULL
  );

  -- Ручные правки недели: размер дня, который пользователь выставил сам.
  CREATE TABLE IF NOT EXISTS plan_overrides (
    date TEXT PRIMARY KEY NOT NULL,
    size TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version;");
  const currentVersion = row?.user_version ?? 0;

  for (let i = currentVersion; i < migrations.length; i++) {
    await db.execAsync(migrations[i]);
    await db.execAsync(`PRAGMA user_version = ${i + 1};`);
  }
}
