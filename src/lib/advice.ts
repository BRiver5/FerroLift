// Ранжированные варианты, когда неделя не складывается, — шестое звено.
//
// Каждая подсказка ИЗМЕРЕНА: планировщик реально перезапускается с
// ослабленным ограничением, и в списке стоит его настоящий результат, а не
// "примерно на столько-то лучше". Ослабление ограничения — всегда компромисс,
// поэтому у каждой подсказки есть строка "чем платишь", а не только выигрыш.

import { addDays, dayRange, weekdayIndex, weekdayName } from "./dates.ts";
import { evaluatePlan, searchPlans, type PlanRequest, type PlanSearch } from "./planner.ts";

export type FixKind = "raise-cap" | "back-to-back" | "unlock-day" | "add-day" | "fewer-days" | "move-peak" | "allow-drop";

export type Fix = {
  kind: FixKind;
  label: string;
  cost: string;
  /** Балл лучшей недели после изменения. */
  score: number;
  /** Разница с текущей лучшей неделей; при отсутствии плана — сам балл. */
  delta: number;
  /** true — без этого изменения допустимой недели нет вовсе. */
  unlocks: boolean;
  /** Что применить к запросу, если пользователь согласится. */
  patch: Partial<PlanRequest["constraints"]> & { peakDate?: string };
};

/**
 * Порог "стоит ли предлагать": доля от того, что неделя ВООБЩЕ может дать
 * относительно недели полного отдыха. Первая версия мерила 5% от абсолютного
 * балла — но балл почти целиком состоит из 42-дневной базы, которую одна
 * неделя сдвигает на единицы процентов, и полезные варианты (+17% к
 * достижимому приросту) отбрасывались как "мелочь". Поймано тестом.
 */
const WORTH_IT = 0.1;

export function suggestFixes(request: PlanRequest, current: PlanSearch): Fix[] {
  const baseline = current.best?.score ?? null;
  const fixes: Fix[] = [];
  const restScore = evaluatePlan(request, Array.from({ length: request.days }, () => "rest" as const)).score;
  const gainRange = baseline === null ? 1 : Math.max(1, baseline - restScore);

  const tryPatch = (
    kind: FixKind,
    label: string,
    cost: string,
    patch: Fix["patch"],
    changed: PlanRequest
  ) => {
    const result = searchPlans(changed);
    if (!result.best) return;
    const unlocks = baseline === null;
    const delta = unlocks ? result.best.score : result.best.score - baseline;
    if (!unlocks && delta <= gainRange * WORTH_IT) return;
    fixes.push({ kind, label, cost, score: result.best.score, delta, unlocks, patch });
  };

  const c = request.constraints;

  if (c.acwrCap < 1.5) {
    const cap = Math.round((c.acwrCap + 0.1) * 10) / 10;
    tryPatch(
      "raise-cap",
      `Allow ramps up to ${cap.toFixed(1)}×`,
      "steeper jumps over your usual load — the zone where overreaching starts",
      { acwrCap: cap },
      { ...request, constraints: { ...c, acwrCap: cap } }
    );
  }

  if (!c.allowBackToBackHard) {
    tryPatch(
      "back-to-back",
      "Allow two hard days in a row",
      "the second hard day starts under yesterday's fatigue",
      { allowBackToBackHard: true },
      { ...request, constraints: { ...c, allowBackToBackHard: true } }
    );
  }

  for (const [date, size] of Object.entries(c.locked)) {
    const locked = { ...c.locked };
    delete locked[date];
    tryPatch(
      "unlock-day",
      `Let the planner choose ${weekdayName(weekdayIndex(date))} instead of your ${size}`,
      "your manual choice for that day is dropped",
      { locked },
      { ...request, constraints: { ...c, locked } }
    );
  }

  // Доступные тренировочные дни в горизонте и сколько не хватает до минимума.
  const horizon = dayRange(request.start, request.days);
  const availableInHorizon = horizon.filter((date) => c.availableWeekdays.includes(weekdayIndex(date))).length;
  const shortfall = Math.max(1, c.minTrainingDays - availableInHorizon);

  // Дни недели, которые можно добавить. Если не хватает двух дней, одиночные
  // добавления ничего не разблокируют — перебираются ПАРЫ (тройки) дней, и
  // предлагается лучшая комбинация, измеренная перезапуском планировщика.
  const candidates = [...new Set(horizon.map(weekdayIndex))].filter((weekday) => !c.availableWeekdays.includes(weekday));
  const combos = combinations(candidates, Math.min(shortfall, candidates.length));
  let bestCombo: { days: number[]; score: number } | null = null;
  for (const combo of combos) {
    const available = [...c.availableWeekdays, ...combo].sort();
    const result = searchPlans({ ...request, constraints: { ...c, availableWeekdays: available } });
    if (result.best && (!bestCombo || result.best.score > bestCombo.score)) bestCombo = { days: combo, score: result.best.score };
  }
  if (bestCombo) {
    const available = [...c.availableWeekdays, ...bestCombo.days].sort();
    const names = bestCombo.days.map((day) => `${weekdayName(day)}s`).join(" and ");
    tryPatch(
      "add-day",
      `Train on ${names} too`,
      bestCombo.days.length === 1 ? "one more day a week at the gym" : `${bestCombo.days.length} more days a week at the gym`,
      { availableWeekdays: available },
      { ...request, constraints: { ...c, availableWeekdays: available } }
    );
  }

  // Принять меньше тренировок — сразу до того, что реально помещается.
  const reachable = Math.max(1, Math.min(c.minTrainingDays - 1, availableInHorizon));
  if (c.minTrainingDays > 1 && reachable < c.minTrainingDays) {
    tryPatch(
      "fewer-days",
      `Accept ${reachable} training day${reachable === 1 ? "" : "s"} this week`,
      "fewer sessions, slower progress",
      { minTrainingDays: reachable },
      { ...request, constraints: { ...c, minTrainingDays: reachable } }
    );
  }

  if (request.target.kind === "peak") {
    for (const shift of [1, 2, 3]) {
      const date = addDays(request.target.date, shift);
      tryPatch(
        "move-peak",
        `Move the target day to ${weekdayName(weekdayIndex(date))} (${date})`,
        `${shift} day${shift === 1 ? "" : "s"} later than planned`,
        { peakDate: date },
        { ...request, target: { kind: "peak", date } }
      );
    }
    if (c.maxFitnessDropPct < 12) {
      const drop = c.maxFitnessDropPct + 4;
      tryPatch(
        "allow-drop",
        `Accept losing up to ${drop}% fitness for freshness`,
        "a deeper taper — fresher, but less base underneath",
        { maxFitnessDropPct: drop },
        { ...request, constraints: { ...c, maxFitnessDropPct: drop } }
      );
    }
  }

  return fixes.sort((a, b) => Number(b.unlocks) - Number(a.unlocks) || b.delta - a.delta);
}

/** Человеческое объяснение, почему перебор ничего не нашёл. */
export function explainInfeasible(search: PlanSearch, request: PlanRequest): string {
  const { pruned } = search;
  const total = pruned.ramp + pruned.backToBack + pruned.tooFewDays + pruned.fitnessDrop;
  if (total === 0) return "No week fits the days you train.";
  const top = (Object.entries(pruned) as [keyof typeof pruned, number][]).sort((a, b) => b[1] - a[1])[0];
  switch (top[0]) {
    case "ramp":
      return `Every week that trains enough jumps above ${request.constraints.acwrCap.toFixed(1)}× your usual load. Your base is still low for this many sessions.`;
    case "backToBack":
      return "The only way to fit the sessions in is two hard days in a row.";
    case "tooFewDays":
      return `You can't reach ${request.constraints.minTrainingDays} training days on the days you marked as available.`;
    case "fitnessDrop":
      return `Getting fresh for the target day costs more fitness than the ${request.constraints.maxFitnessDropPct}% you allow.`;
  }
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [[]];
  if (size > items.length) return [];
  const out: T[][] = [];
  const walk = (start: number, picked: T[]) => {
    if (picked.length === size) {
      out.push([...picked]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      picked.push(items[i]);
      walk(i + 1, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return out;
}
