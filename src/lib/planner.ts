// Планировщик недели — четвёртое звено цепочки: состояние модели нагрузки
// (load.ts) плюс ограничения пользователя дают форму недели — какой день
// отдых, какой лёгкий, средний или тяжёлый.
//
// ТОЧНЫЙ ПЕРЕБОР, а не эвристика. У каждого дня четыре варианта, дней семь —
// 4^7 = 16 384 недели. Это мало: перебирается всё, с отсечением ветвей, где
// ограничение уже нарушено (скачок ACWR, два тяжёлых дня подряд, день, когда
// пользователь не тренируется). Жадный вариант "каждый день ставь самое
// тяжёлое, что позволяет ACWR" проигрывает систематически: он сжигает запас
// в начале недели и упирается в потолок к выходным, тогда как оптимум часто
// ставит лёгкий день ПЕРЕД тяжёлым, чтобы тот прошёл под потолком.
//
// Цель задаётся явно и раскладывается на слагаемые — экран "почему" их
// показывает: что дал каждый член, а не один итоговый балл.

import { addDays, dayRange, weekdayIndex } from "./dates.ts";
import { acwrOf, formOf, monotony, step, type LoadState } from "./load.ts";
import type { SessionSize } from "./model.ts";

export const SIZE_FACTOR: Record<SessionSize, number> = {
  rest: 0,
  light: 0.6,
  moderate: 1.0,
  hard: 1.45,
};

const SIZES_DESC: SessionSize[] = ["hard", "moderate", "light", "rest"];

export type PlanTarget = { kind: "build" } | { kind: "peak"; date: string };

export type PlanConstraints = {
  /** Потолок ACWR на любой день недели. */
  acwrCap: number;
  allowBackToBackHard: boolean;
  /** Дни недели, когда пользователь вообще может тренироваться (0 — пн). */
  availableWeekdays: number[];
  /** Дни, зафиксированные пользователем вручную (дата → размер). */
  locked: Record<string, SessionSize>;
  minTrainingDays: number;
  /** В режиме пика — насколько можно потерять готовность ради свежести, %. */
  maxFitnessDropPct: number;
};

export const DEFAULT_CONSTRAINTS: PlanConstraints = {
  acwrCap: 1.3,
  allowBackToBackHard: false,
  availableWeekdays: [0, 1, 2, 3, 4, 5, 6],
  locked: {},
  minTrainingDays: 2,
  maxFitnessDropPct: 6,
};

/**
 * Сколько дней истории нужно, чтобы потолок ACWR вообще имел смысл. Пока
 * 28-дневное среднее не набралось, отношение "острая / хроническая" после
 * первой же тренировки новичка улетает за 3 — и перебор запрещал ему вторую
 * тренировку в неделю. Это поймал тест, а не пользователь: правило ACWR
 * включается только с трёх недель истории, до этого число показывается, но
 * неделю не режет.
 */
export const RAMP_MIN_HISTORY_DAYS = 21;

export type PlanRequest = {
  start: string;
  days: number;
  startState: LoadState;
  /** Сколько дней прошло от первой записанной тренировки до начала плана. */
  historyDays: number;
  /** Нагрузка "средней" тренировки — множители размеров считаются от неё. */
  base: number;
  target: PlanTarget;
  constraints: PlanConstraints;
};

export type PlanDay = {
  date: string;
  size: SessionSize;
  load: number;
  fitness: number;
  fatigue: number;
  form: number;
  acwr: number | null;
  locked: boolean;
};

export type ScoreTerm = { label: string; value: number; note: string };

export type Violation = { date: string | null; kind: "ramp" | "back-to-back" | "unavailable" | "too-few-days" | "fitness-drop"; message: string };

export type Plan = {
  sizes: SessionSize[];
  days: PlanDay[];
  score: number;
  terms: ScoreTerm[];
  weeklyLoad: number;
  monotony: number;
  maxAcwr: number | null;
  hardDays: number;
  trainingDays: number;
  endFitness: number;
  endForm: number;
  /** Форма в целевой день (режим пика) — null в режиме роста. */
  targetForm: number | null;
  violations: Violation[];
};

export type PruneCounts = { ramp: number; backToBack: number; tooFewDays: number; fitnessDrop: number };

export type PlanSearch = {
  best: Plan | null;
  alternatives: Plan[];
  /** Сколько полных недель оценено (после отсечений). */
  evaluated: number;
  /** Сколько ветвей отсечено и по какой причине — для экрана "почему". */
  pruned: PruneCounts;
  /** Пик за горизонтом — план строится как рост, и это говорится прямо. */
  targetOutOfRange: boolean;
};

function isAvailable(request: PlanRequest, date: string): boolean {
  return request.constraints.availableWeekdays.includes(weekdayIndex(date));
}

/**
 * Оценка готовой недели: прогон модели, слагаемые цели и список нарушений.
 * Используется и перебором (там нарушений не бывает — ветви отсечены), и для
 * недели, которую пользователь собрал руками (там нарушения показываются).
 */
export function evaluatePlan(request: PlanRequest, sizes: SessionSize[]): Plan {
  const dates = dayRange(request.start, request.days);
  let state = request.startState;
  const days: PlanDay[] = [];
  const violations: Violation[] = [];
  let maxAcwr: number | null = null;
  let targetForm: number | null = null;
  let targetFitness: number | null = null;

  dates.forEach((date, index) => {
    const size = sizes[index] ?? "rest";
    const load = Math.round(request.base * SIZE_FACTOR[size]);
    state = step(state, load);
    const acwr = acwrOf(state);
    if (acwr !== null) maxAcwr = maxAcwr === null ? acwr : Math.max(maxAcwr, acwr);
    days.push({
      date,
      size,
      load,
      fitness: state.fitness,
      fatigue: state.fatigue,
      form: formOf(state),
      acwr,
      locked: request.constraints.locked[date] !== undefined,
    });

    if (size !== "rest" && !isAvailable(request, date) && request.constraints.locked[date] === undefined) {
      violations.push({ date, kind: "unavailable", message: `${date} is not a training day for you` });
    }
    const rampActive = request.historyDays + index >= RAMP_MIN_HISTORY_DAYS;
    if (rampActive && acwr !== null && size !== "rest" && acwr > request.constraints.acwrCap) {
      violations.push({ date, kind: "ramp", message: `load jumps to ${acwr.toFixed(2)}× your usual on ${date}` });
    }
    if (!request.constraints.allowBackToBackHard && index > 0 && size === "hard" && sizes[index - 1] === "hard") {
      violations.push({ date, kind: "back-to-back", message: `two hard days in a row ending ${date}` });
    }
    if (request.target.kind === "peak" && date === request.target.date) {
      targetForm = formOf(state);
      targetFitness = state.fitness;
    }
  });

  const loads = days.map((day) => day.load);
  const trainingDays = sizes.filter((size) => size !== "rest").length;
  if (trainingDays < request.constraints.minTrainingDays) {
    violations.push({
      date: null,
      kind: "too-few-days",
      message: `only ${trainingDays} training day${trainingDays === 1 ? "" : "s"}, minimum is ${request.constraints.minTrainingDays}`,
    });
  }

  const startFitness = request.startState.fitness;
  const terms: ScoreTerm[] = [];
  const mono = monotony(loads);

  if (request.target.kind === "peak" && targetForm !== null && targetFitness !== null) {
    const drop = startFitness > 1 ? ((startFitness - targetFitness) / startFitness) * 100 : 0;
    if (drop > request.constraints.maxFitnessDropPct) {
      violations.push({
        date: request.target.date,
        kind: "fitness-drop",
        message: `fitness falls ${drop.toFixed(0)}% by the target day — more than the ${request.constraints.maxFitnessDropPct}% you allow`,
      });
    }
    terms.push({ label: "Form on the target day", value: targetForm, note: "fitness minus fatigue on the day that matters" });
    terms.push({ label: "Fitness kept", value: 0.25 * targetFitness, note: "a quarter weight — freshness without detraining" });
  } else {
    terms.push({ label: "Fitness at the end", value: state.fitness, note: "what the week adds to your 42-day base" });
    const leftover = Math.max(0, -formOf(state));
    terms.push({ label: "Fatigue carried over", value: -0.5 * leftover, note: "half of any negative form at the end of the week" });
  }
  const monotonyPenalty = -Math.max(0, mono - 1.5) * request.base * 0.04;
  terms.push({ label: "Monotony", value: monotonyPenalty, note: `same load every day is penalised above 1.5 (this week ${mono > 50 ? "flat" : mono.toFixed(2)})` });

  const score = terms.reduce((sum, term) => sum + term.value, 0);

  return {
    sizes,
    days,
    score,
    terms,
    weeklyLoad: loads.reduce((sum, value) => sum + value, 0),
    monotony: mono,
    maxAcwr,
    hardDays: sizes.filter((size) => size === "hard").length,
    trainingDays,
    endFitness: state.fitness,
    endForm: formOf(state),
    targetForm,
    violations,
  };
}

const KEEP_ALTERNATIVES = 4;

/** Перебор всех допустимых недель с отсечением ветвей. */
export function searchPlans(request: PlanRequest): PlanSearch {
  const dates = dayRange(request.start, request.days);
  const pruned: PruneCounts = { ramp: 0, backToBack: 0, tooFewDays: 0, fitnessDrop: 0 };
  const top: Plan[] = [];
  let evaluated = 0;

  const targetOutOfRange =
    request.target.kind === "peak" && !dates.includes(request.target.date);
  const effectiveRequest: PlanRequest = targetOutOfRange ? { ...request, target: { kind: "build" } } : request;

  const remainingAvailable = dates.map((_, index) =>
    dates.slice(index).filter((date) => isAvailable(request, date) || (request.constraints.locked[date] ?? "rest") !== "rest").length
  );

  const sizes: SessionSize[] = [];

  const walk = (index: number, state: LoadState, trainingDays: number) => {
    if (index === dates.length) {
      if (trainingDays < request.constraints.minTrainingDays) {
        pruned.tooFewDays += 1;
        return;
      }
      const plan = evaluatePlan(effectiveRequest, [...sizes]);
      if (plan.violations.some((violation) => violation.kind === "fitness-drop")) {
        pruned.fitnessDrop += 1;
        return;
      }
      evaluated += 1;
      insertTop(top, plan);
      return;
    }

    // Даже если все оставшиеся доступные дни будут тренировочными, минимум не
    // набрать — ветвь бесполезна.
    if (trainingDays + remainingAvailable[index] < request.constraints.minTrainingDays) {
      pruned.tooFewDays += 1;
      return;
    }

    const date = dates[index];
    const locked = request.constraints.locked[date];
    const options: SessionSize[] = locked ? [locked] : isAvailable(request, date) ? SIZES_DESC : ["rest"];

    for (const size of options) {
      if (!request.constraints.allowBackToBackHard && size === "hard" && sizes[index - 1] === "hard" && !locked) {
        pruned.backToBack += 1;
        continue;
      }
      const next = step(state, Math.round(request.base * SIZE_FACTOR[size]));
      const acwr = acwrOf(next);
      const rampActive = request.historyDays + index >= RAMP_MIN_HISTORY_DAYS;
      if (rampActive && size !== "rest" && acwr !== null && acwr > request.constraints.acwrCap && !locked) {
        pruned.ramp += 1;
        continue;
      }
      sizes.push(size);
      walk(index + 1, next, trainingDays + (size === "rest" ? 0 : 1));
      sizes.pop();
    }
  };

  walk(0, request.startState, 0);

  return {
    best: top[0] ?? null,
    alternatives: top.slice(1),
    evaluated,
    pruned,
    targetOutOfRange,
  };
}

function insertTop(top: Plan[], plan: Plan) {
  // Зафиксированные пользователем дни могут нарушать ограничения — такие
  // недели допустимы (он так решил), но при равном балле уступают чистым.
  const key = (p: Plan) => p.score - p.violations.length * 1e-6;
  if (top.length >= KEEP_ALTERNATIVES + 1 && key(plan) <= key(top[top.length - 1])) return;
  top.push(plan);
  top.sort((a, b) => key(b) - key(a));
  if (top.length > KEEP_ALTERNATIVES + 1) top.pop();
}

/** Где неделя упирается: какое ограничение отсекло больше всего вариантов. */
export function bindingConstraint(search: PlanSearch): keyof PruneCounts | null {
  const entries = Object.entries(search.pruned) as [keyof PruneCounts, number][];
  const top = entries.sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : null;
}

/** Дата начала планирования: сегодня, если сегодня ещё не тренировался, иначе завтра. */
export function planStart(today: string, trainedToday: boolean): string {
  return trainedToday ? addDays(today, 1) : today;
}
