// "Что если" — седьмое звено. Две недели (предложенная планировщиком и
// изменённая пользователем, или сценарий "пропущу четверг") сравниваются
// построчно, в две колонки. Вердикт перечисляет, что стало хуже, даже если
// главная цифра выросла: больше готовности ценой скачка нагрузки — это
// компромисс, а не "просто лучше".

import { SIZE_LABELS, type SessionSize } from "./model.ts";
import { evaluatePlan, type Plan, type PlanRequest } from "./planner.ts";

export type Direction = "better" | "worse" | "same";

export type DiffRow = { label: string; before: string; after: string; direction: Direction };

export type Comparison = {
  before: Plan;
  after: Plan;
  rows: DiffRow[];
  verdict: string;
  tradeoffs: string[];
};

function dir(before: number, after: number, higherIsBetter: boolean, epsilon = 0.5): Direction {
  if (Math.abs(after - before) < epsilon) return "same";
  return (after > before) === higherIsBetter ? "better" : "worse";
}

const fmt = (value: number) => Math.round(value).toString();
const fmtRatio = (value: number | null) => (value === null ? "—" : `${value.toFixed(2)}×`);

export function comparePlans(before: Plan, after: Plan): Comparison {
  const rows: DiffRow[] = [];
  const peak = before.targetForm !== null && after.targetForm !== null;

  if (peak) {
    rows.push({
      label: "Form on target day",
      before: fmt(before.targetForm as number),
      after: fmt(after.targetForm as number),
      direction: dir(before.targetForm as number, after.targetForm as number, true),
    });
  }
  rows.push({ label: "Fitness at week end", before: fmt(before.endFitness), after: fmt(after.endFitness), direction: dir(before.endFitness, after.endFitness, true) });
  rows.push({ label: "Form at week end", before: fmt(before.endForm), after: fmt(after.endForm), direction: dir(before.endForm, after.endForm, true) });
  rows.push({ label: "Weekly load", before: fmt(before.weeklyLoad), after: fmt(after.weeklyLoad), direction: "same" });
  rows.push({
    label: "Steepest ramp",
    before: fmtRatio(before.maxAcwr),
    after: fmtRatio(after.maxAcwr),
    direction: before.maxAcwr === null || after.maxAcwr === null ? "same" : dir(before.maxAcwr, after.maxAcwr, false, 0.02),
  });
  rows.push({ label: "Hard days", before: String(before.hardDays), after: String(after.hardDays), direction: "same" });
  rows.push({
    label: "Monotony",
    before: before.monotony > 50 ? "flat" : before.monotony.toFixed(2),
    after: after.monotony > 50 ? "flat" : after.monotony.toFixed(2),
    direction: dir(Math.min(before.monotony, 9), Math.min(after.monotony, 9), false, 0.05),
  });

  const tradeoffs: string[] = [];
  if (after.maxAcwr !== null && before.maxAcwr !== null && after.maxAcwr > before.maxAcwr + 0.02) {
    tradeoffs.push(`a steeper ramp (${after.maxAcwr.toFixed(2)}×)`);
  }
  if (after.endForm < before.endForm - 0.5) tradeoffs.push("more fatigue carried into next week");
  if (after.endFitness < before.endFitness - 0.5) tradeoffs.push("less fitness gained");
  if (after.violations.length > before.violations.length) {
    tradeoffs.push(`${after.violations.length - before.violations.length} rule${after.violations.length - before.violations.length === 1 ? "" : "s"} broken`);
  }

  const delta = after.score - before.score;
  let verdict: string;
  if (Math.abs(delta) < 0.5) verdict = "About the same week overall.";
  else if (delta > 0) verdict = tradeoffs.length ? `Scores higher, but with ${tradeoffs.join(" and ")}.` : "Scores higher with nothing given up.";
  else verdict = `Scores ${Math.abs(delta).toFixed(0)} lower than the planner's week${tradeoffs.length ? `, with ${tradeoffs.join(" and ")}` : ""}.`;

  return { before, after, rows, verdict, tradeoffs };
}

/** Сценарий "этот день меняю на такой-то" поверх готовой недели. */
export function withDay(request: PlanRequest, base: Plan, index: number, size: SessionSize): Plan {
  const sizes = [...base.sizes];
  sizes[index] = size;
  return evaluatePlan(request, sizes);
}

export function describeSizes(sizes: SessionSize[]): string {
  return sizes.map((size) => SIZE_LABELS[size][0]).join(" ");
}
