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
  /** Что показываем: собранное пользователем руками, если есть, иначе лучший найденный. */
  shown: Plan | null;
  manual: boolean;
  programs: Record<string, DayProgram | null>;
};

export function planWeek(input: EngineInput, manualSizes?: SessionSize[] | null): WeekPlan {
  const snap = snapshot(input);
  const search = searchPlans(snap.request);
  const manual = Boolean(manualSizes && manualSizes.length === snap.request.days);
  const shown = manual ? evaluatePlan(snap.request, manualSizes as SessionSize[]) : search.best;

  const programs: Record<string, DayProgram | null> = {};
  if (shown) {
    let rotation = 0;
    for (const day of shown.days) {
      programs[day.date] = programForDay(day.size, rotation, input.lifts, input.strength, input.settings.bodyweight, snap.today);
      if (day.size !== "rest") rotation += 1;
    }
  }

  return { snap, search, shown, manual, programs };
}
