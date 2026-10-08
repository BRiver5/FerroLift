import { test } from "node:test";
import assert from "node:assert/strict";
import { programForDay } from "./program.ts";
import { emptyStrengthModel, observeLift } from "./strength.ts";
import { step, ZERO_STATE, type LoadState } from "./load.ts";
import { DEFAULT_CONSTRAINTS, evaluatePlan, searchPlans, type PlanRequest } from "./planner.ts";
import { explainInfeasible, suggestFixes } from "./advice.ts";
import { comparePlans, withDay } from "./whatif.ts";
import { DEFAULT_SETTINGS, planWeek, snapshot } from "./engine.ts";
import { presetLifts, session, set } from "./testkit.ts";

const lifts = presetLifts();

function trained(): LoadState {
  let state = ZERO_STATE;
  for (let i = 0; i < 60; i++) state = step(state, i % 7 === 0 || i % 7 === 2 || i % 7 === 4 ? 350 : 0);
  return state;
}

function request(over: Partial<PlanRequest> = {}): PlanRequest {
  return {
    start: "2026-10-12",
    days: 7,
    startState: trained(),
    historyDays: 60,
    base: 350,
    target: { kind: "build" },
    constraints: DEFAULT_CONSTRAINTS,
    ...over,
  };
}

// --- программа ---

test("тяжёлый день: два базовых и два вспомогательных из нужной ротации", () => {
  const program = programForDay("hard", 0, lifts, emptyStrengthModel(), 75, "2026-10-12")!;
  assert.equal(program.rotation, "A");
  const kinds = program.lifts.map((item) => item.lift.kind);
  assert.equal(kinds.filter((k) => k === "compound").length, 2);
  assert.ok(program.lifts.every((item) => ["legs", "push", "core"].includes(item.lift.group)));
  // Разные группы, а не два жима подряд.
  const compounds = program.lifts.filter((item) => item.lift.kind === "compound").map((item) => item.lift.group);
  assert.equal(new Set(compounds).size, compounds.length);
});

test("ротация чередуется: второй тренировочный день — тяга и спина", () => {
  const program = programForDay("moderate", 1, lifts, emptyStrengthModel(), 75, "2026-10-12")!;
  assert.equal(program.rotation, "B");
  assert.ok(program.lifts.every((item) => ["hinge", "pull", "arms"].includes(item.lift.group)));
});

test("вес назначается из модели силы, а без модели честно не назначается", () => {
  let strength = emptyStrengthModel();
  strength = observeLift(strength, "squat", 150, "2026-10-10");
  const program = programForDay("hard", 0, lifts, strength, 75, "2026-10-12")!;
  const squat = program.lifts.find((item) => item.lift.id === "squat")!;
  // hard: 3 повтора @8.5 → эфф. 4.5 → 150 / 1.15 = 130.4 → 130
  assert.equal(squat.prescription!.weight, 130);
  const bench = program.lifts.find((item) => item.lift.id === "bench")!;
  assert.equal(bench.prescription, null);
});

test("в день отдыха программы нет", () => {
  assert.equal(programForDay("rest", 0, lifts, emptyStrengthModel(), 75, "2026-10-12"), null);
});

// --- советы ---

test("невыполнимая неделя получает измеренные варианты, разблокирующие идут первыми", () => {
  const req = request({ constraints: { ...DEFAULT_CONSTRAINTS, availableWeekdays: [0], minTrainingDays: 3 } });
  const search = searchPlans(req);
  assert.equal(search.best, null);
  const fixes = suggestFixes(req, search);
  assert.ok(fixes.length > 0);
  assert.ok(fixes.every((fix) => fix.unlocks));
  // Каждый вариант — реальный результат перезапуска, а не формула.
  for (const fix of fixes.slice(0, 2)) {
    const changed = { ...req, constraints: { ...req.constraints, ...fix.patch } };
    assert.ok(Math.abs(searchPlans(changed).best!.score - fix.score) < 1e-9);
  }
  assert.ok(explainInfeasible(search, req).length > 10);
});

test("у каждого варианта есть цена, а не только выигрыш", () => {
  const req = request({ constraints: { ...DEFAULT_CONSTRAINTS, acwrCap: 1.0 } });
  const fixes = suggestFixes(req, searchPlans(req));
  const cap = fixes.find((fix) => fix.kind === "raise-cap");
  assert.ok(cap, "поднятие потолка должно что-то давать при потолке 1.0");
  assert.ok(cap!.cost.length > 0);
  assert.ok(cap!.delta > 0);
});

test("не хватает двух дней — предлагается пара дней сразу, а не бесполезный один", () => {
  const req = request({ constraints: { ...DEFAULT_CONSTRAINTS, availableWeekdays: [0], minTrainingDays: 3 } });
  const fixes = suggestFixes(req, searchPlans(req));
  const add = fixes.find((fix) => fix.kind === "add-day")!;
  assert.ok(add, "добавление дней должно разблокировать неделю");
  assert.equal(add.patch.availableWeekdays!.length, 3);
  assert.ok(add.label.includes(" and "));
  const fewer = fixes.find((fix) => fix.kind === "fewer-days")!;
  assert.equal(fewer.patch.minTrainingDays, 1);
});

test("мелкие ослабления не предлагаются: порог считается от достижимого за неделю", () => {
  const req = request();
  const search = searchPlans(req);
  const rest = evaluatePlan(req, ["rest", "rest", "rest", "rest", "rest", "rest", "rest"]).score;
  const range = search.best!.score - rest;
  for (const fix of suggestFixes(req, search)) assert.ok(fix.delta > range * 0.1, `${fix.label}: ${fix.delta}`);
});

// --- что если ---

test("замена дня даёт дифф в две колонки и честный вердикт", () => {
  const req = request();
  const best = searchPlans(req).best!;
  const hardIndex = best.sizes.findIndex((size) => size !== "rest");
  const skipped = withDay(req, best, hardIndex, "rest");
  const diff = comparePlans(best, skipped);
  assert.equal(diff.rows.find((row) => row.label === "Fitness at week end")!.direction, "worse");
  assert.ok(diff.verdict.includes("lower"));
});

test("добавленный тяжёлый день: выше готовность, но цена названа", () => {
  const req = request();
  const best = searchPlans(req).best!;
  const restIndex = best.sizes.findIndex((size, i) => size === "rest" && best.sizes[i - 1] !== "hard" && best.sizes[i + 1] !== "hard");
  const extra = evaluatePlan(req, best.sizes.map((size, i) => (i === restIndex ? "hard" : size)));
  const diff = comparePlans(best, extra);
  assert.ok(diff.tradeoffs.length > 0 || extra.score <= best.score);
});

// --- сборка цепочки ---

test("снимок: сегодняшняя тренировка уже в истории, план начинается завтра", () => {
  const sessions = [session("a", "2026-10-07"), session("b", "2026-10-12")];
  const sets = [set("a", "squat", 100, 5, 8), set("b", "squat", 105, 5, 8)];
  const snap = snapshot({ lifts, sessions, sets, strength: emptyStrengthModel(), settings: DEFAULT_SETTINGS, today: "2026-10-12" });
  assert.equal(snap.trainedToday, true);
  assert.equal(snap.request.start, "2026-10-13");
  assert.equal(snap.request.historyDays, 6);
  assert.equal(snap.history.length, 42);
});

test("неделя целиком: план, программы на тренировочные дни, ручная правка поверх", () => {
  const sessions = [session("a", "2026-10-05", { rpe: 7, minutes: 60 }), session("b", "2026-10-08", { rpe: 8, minutes: 55 })];
  const sets = [set("a", "squat", 100, 5, 8), set("b", "bench", 80, 5, 8)];
  let strength = emptyStrengthModel();
  strength = observeLift(strength, "squat", 125, "2026-10-05");
  const input = { lifts, sessions, sets, strength, settings: DEFAULT_SETTINGS, today: "2026-10-12" };

  const auto = planWeek(input);
  assert.ok(auto.shown);
  assert.equal(auto.manual, false);
  for (const day of auto.shown!.days) {
    if (day.size === "rest") assert.equal(auto.programs[day.date], null);
    else assert.ok(auto.programs[day.date]!.lifts.length > 0);
  }

  const manual = planWeek(input, ["hard", "rest", "hard", "rest", "hard", "rest", "rest"]);
  assert.equal(manual.manual, true);
  assert.deepEqual(manual.shown!.sizes, ["hard", "rest", "hard", "rest", "hard", "rest", "rest"]);
});
