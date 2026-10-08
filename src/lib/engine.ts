// Сборка цепочки в одном месте: parse → strength → load → planner → program.
// Экраны разговаривают только с этим файлом, чтобы порядок звеньев не
// повторялся в каждом компоненте.

import { addDays, diffDays, todayIso } from "./dates.ts";
import {
  dailyLoads,
  sessionLoad,
  simulate,
  typicalSessionLoad,
  ZERO_STATE,
  type DayPoint,
  type LoadState,
  type SessionLoad,
} from "./load.ts";
import type { Lift, Session, SessionSize, SetEntry } from "./model.ts";
import {
  DEFAULT_CONSTRAINTS,
  evaluatePlan,
  planStart,
  searchPlans,
  type Plan,
  type PlanConstraints,
  type PlanRequest,
  type PlanSearch,
  type PlanTarget,
} from "./planner.ts";
import { programForDay, type DayProgram } from "./program.ts";
import type { StrengthModel } from "./strength.ts";

export type TrainingSettings = {
  bodyweight: number;
  target: PlanTarget;
  constraints: PlanConstraints;
  horizonDays: number;
};

export const DEFAULT_SETTINGS: TrainingSettings = {
  bodyweight: 75,
  target: { kind: "build" },
  constraints: DEFAULT_CONSTRAINTS,
  horizonDays: 7,
};

/** История для графика формы — шесть недель назад. */
const HISTORY_DAYS = 42;
/** Прогрев модели: ещё 120 дней до окна графика, чтобы 42-дневное среднее успело набраться. */
const WARMUP_DAYS = 120;

export type EngineInput = {
  lifts: Lift[];
  sessions: Session[];
  sets: SetEntry[];
  strength: StrengthModel;
  settings: TrainingSettings;
  today?: string;
};

export type Snapshot = {
  today: string;
  loads: SessionLoad[];
  history: DayPoint[];
  now: DayPoint | null;
  /** Состояние модели на начало планирования. */
  startState: LoadState;
  base: number;
  request: PlanRequest;
  trainedToday: boolean;
};

export function snapshot(input: EngineInput): Snapshot {
  const today = input.today ?? todayIso();
  const loads = input.sessions.map((session) => sessionLoad(session, input.sets));
  const trainedToday = loads.some((load) => load.date === today && load.sets > 0);
  const start = planStart(today, trainedToday);

  const from = addDays(today, -(HISTORY_DAYS + WARMUP_DAYS));
  // Состояние на начало планирования: если сегодня уже была тренировка,
  // она входит в историю; если нет — сегодняшний день планируется.
  const historyEnd = trainedToday ? today : addDays(today, -1);
  const series = dailyLoads(loads, from, historyEnd);
  const { points, end } = simulate(ZERO_STATE, series);
  const history = points.slice(-HISTORY_DAYS);

  const base = typicalSessionLoad(loads);
  const firstDate = loads.reduce<string | null>((first, item) => (first === null || item.date < first ? item.date : first), null);
  const historyDays = firstDate ? Math.max(0, diffDays(firstDate, start)) : 0;

  return {
    today,
    loads,
    history,
    now: history[history.length - 1] ?? null,
    startState: end,
    base,
    trainedToday,
    request: {
      start,
      days: input.settings.horizonDays,
      startState: end,
      historyDays,
      base,
      target: input.settings.target,
      constraints: input.settings.constraints,
    },
  };
}

export type WeekPlan = {
  snap: Snapshot;
  search: PlanSearch;
  /**
   * Что показываем: лучшая неделя с учётом зафиксированных пользователем
   * дней. Если допустимой нет — неделя "как зафиксировано, остальное отдых",
   * с перечисленными нарушениями: пустой экран хуже честного "так нельзя".
   */
  shown: Plan | null;
  /** Лучшая неделя БЕЗ ручных фиксаций — для сравнения "твоя версия против свободной". */
  free: Plan | null;
  programs: Record<string, DayProgram | null>;
};

const ROTATION_A_GROUPS = new Set(["legs", "push", "core"]);

/**
 * Какая ротация была последней. Без этого каждая неделя начиналась бы с A, и
 * человек, сделавший ноги в воскресенье, получал бы ноги снова в понедельник.
 */
export function lastRotation(input: EngineInput): "A" | "B" | null {
  const latest = [...input.sessions].sort((a, b) => b.date.localeCompare(a.date)).find((s) => input.sets.some((set) => set.sessionId === s.id));
  if (!latest) return null;
  const liftById = new Map(input.lifts.map((lift) => [lift.id, lift]));
  let a = 0;
  let b = 0;
  for (const set of input.sets) {
    if (set.sessionId !== latest.id) continue;
    const lift = liftById.get(set.liftId);
    if (!lift) continue;
    if (ROTATION_A_GROUPS.has(lift.group)) a += 1;
    else b += 1;
  }
  return a >= b ? "A" : "B";
}

export function planWeek(input: EngineInput): WeekPlan {
  const snap = snapshot(input);
  const search = searchPlans(snap.request);
  const locked = snap.request.constraints.locked;
  const hasLocks = Object.keys(locked).length > 0;

  let shown = search.best;
  if (!shown) {
    const sizes = Array.from({ length: snap.request.days }, (_, i) => locked[addDays(snap.request.start, i)] ?? "rest");
    shown = evaluatePlan(snap.request, sizes);
  }
  const free = hasLocks ? searchPlans({ ...snap.request, constraints: { ...snap.request.constraints, locked: {} } }).best : null;

  const programs: Record<string, DayProgram | null> = {};
  let rotation = lastRotation(input) === "A" ? 1 : 0;
  for (const day of shown.days) {
    programs[day.date] = programForDay(day.size, rotation, input.lifts, input.strength, input.settings.bodyweight, snap.today);
    if (day.size !== "rest") rotation += 1;
  }

  return { snap, search, shown, free, programs };
}
