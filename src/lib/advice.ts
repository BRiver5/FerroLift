// Ранжированные варианты, когда неделя не складывается, — шестое звено.
//
// Каждая подсказка ИЗМЕРЕНА: планировщик реально перезапускается с
// ослабленным ограничением, и в списке стоит его настоящий результат, а не
// "примерно на столько-то лучше". Ослабление ограничения — всегда компромисс,
// поэтому у каждой подсказки есть строка "чем платишь", а не только выигрыш.

import { addDays, dayRange, weekdayIndex, weekdayName } from "./dates.ts";
import { searchPlans, type PlanRequest, type PlanSearch } from "./planner.ts";

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

/** Насколько лучше должна стать неделя, чтобы ослабление вообще предлагать. */
const WORTH_IT = 0.05;

export function suggestFixes(request: PlanRequest, current: PlanSearch): Fix[] {
  const baseline = current.best?.score ?? null;
  const fixes: Fix[] = [];

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
    if (!unlocks && delta <= Math.abs(baseline) * WORTH_IT) return;
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

  const unavailableInHorizon = dayRange(request.start, request.days).filter(
    (date) => !c.availableWeekdays.includes(weekdayIndex(date))
  );
  const seenWeekdays = new Set<number>();
  for (const date of unavailableInHorizon) {
    const weekday = weekdayIndex(date);
    if (seenWeekdays.has(weekday)) continue;
    seenWeekdays.add(weekday);
    const available = [...c.availableWeekdays, weekday].sort();
    tryPatch(
      "add-day",
      `Train on ${weekdayName(weekday)}s too`,
      "one more day a week at the gym",
      { availableWeekdays: available },
      { ...request, constraints: { ...c, availableWeekdays: available } }
    );
  }

  if (c.minTrainingDays > 1) {
    tryPatch(
      "fewer-days",
      `Accept ${c.minTrainingDays - 1} training day${c.minTrainingDays - 1 === 1 ? "" : "s"} this week`,
      "fewer sessions, slower progress",
      { minTrainingDays: c.minTrainingDays - 1 },
      { ...request, constraints: { ...c, minTrainingDays: c.minTrainingDays - 1 } }
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
