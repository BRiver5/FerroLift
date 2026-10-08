import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveReps,
  emptyStrengthModel,
  estimateLift,
  observeLift,
  prescribe,
  rebuildStrength,
  sessionObservation,
  setE1rm,
} from "./strength.ts";
import { presetLifts, session, set } from "./testkit.ts";

const lifts = presetLifts();
const squat = lifts.find((lift) => lift.id === "squat")!;
const pullup = lifts.find((lift) => lift.id === "pullup")!;

test("запас повторов меняет оценку: @6 сильнее, чем @10 при тех же цифрах", () => {
  const easy = setE1rm(100, 5, 6)!;
  const max = setE1rm(100, 5, 10)!;
  assert.ok(easy > max);
  // 100 × (1 + 5/30) = 116.7 при отказе; с запасом 4 — 100 × (1 + 9/30) = 130
  assert.ok(Math.abs(max - 116.67) < 0.1);
  assert.ok(Math.abs(easy - 130) < 0.1);
});

test("без RPE предполагается запас в два повтора, а не отказ", () => {
  assert.equal(effectiveReps(5, null), 7);
  assert.equal(effectiveReps(5, 10), 5);
  assert.equal(effectiveReps(5, 9.5), 5.5);
});

test("слишком длинный подход не используется для оценки максимума", () => {
  assert.equal(setE1rm(40, 15, 8), null);
  assert.equal(setE1rm(0, 5, 8), null);
});

test("для подтягиваний оценка считается от веса тела плюс отягощение", () => {
  const value = sessionObservation([set("s1", "pullup", 10, 5, 8)], pullup, 80)!;
  // (80 + 10) × (1 + 7/30) = 111
  assert.ok(Math.abs(value - 111) < 0.01);
});

test("наблюдение тренировки — лучший подход, а не средний", () => {
  const value = sessionObservation(
    [set("s", "squat", 100, 5, 7), set("s", "squat", 110, 3, 9), set("s", "squat", 90, 8, 8)],
    squat,
    75
  )!;
  // 100×(1+8/30)=126.7; 110×(1+4/30)=124.7; 90×(1+10/30)=120 — лучший первый
  assert.ok(Math.abs(value - 126.67) < 0.1);
});

test("модель накапливается и сглаживает, а не прыгает к последнему значению", () => {
  let model = emptyStrengthModel();
  model = observeLift(model, "squat", 120, "2026-09-01");
  model = observeLift(model, "squat", 125, "2026-09-04");
  model = observeLift(model, "squat", 128, "2026-09-08");
  const row = model.squat;
  assert.equal(row.samples, 3);
  assert.ok(row.e1rm > 120 && row.e1rm < 128);
  assert.equal(row.lastAt, "2026-09-08");
});

test("лишний ноль не утаскивает модель за собой", () => {
  let model = emptyStrengthModel();
  for (const [i, value] of [140, 142, 143, 144].entries()) model = observeLift(model, "squat", value, `2026-09-0${i + 1}`);
  const before = model.squat.e1rm;
  model = observeLift(model, "squat", 1430, "2026-09-10");
  // Наблюдение обрезано до +12%, шаг 0.25 — модель сдвинулась максимум на ~4.3 кг.
  assert.ok(model.squat.e1rm - before < 5, `сдвиг ${model.squat.e1rm - before}`);
  assert.ok(model.squat.best < 170);
});

test("доверие растёт с числом наблюдений и падает за месяцы без тренировок", () => {
  let model = emptyStrengthModel();
  model = observeLift(model, "squat", 120, "2026-09-01");
  const one = estimateLift(model, "squat", "2026-09-01")!;
  for (let i = 0; i < 5; i++) model = observeLift(model, "squat", 121 + i, `2026-09-1${i}`);
  const many = estimateLift(model, "squat", "2026-09-15")!;
  const stale = estimateLift(model, "squat", "2026-12-15")!;
  assert.ok(many.confidence > one.confidence);
  assert.ok(stale.confidence < many.confidence * 0.3);
  assert.equal(estimateLift(model, "bench"), null);
});

test("назначение веса — обратная формула с округлением вниз до шага", () => {
  // e1RM 150, 5 повторов @8 → нагрузка 150 / (1 + 7/30) = 121.6 → 120 при шаге 2.5
  const p = prescribe(150, 5, 8, squat, 75);
  assert.equal(p.weight, 120);
  assert.ok(p.intensity > 0.8 && p.intensity < 0.82);
  assert.equal(p.bodyweightOnly, false);
});

test("для подтягиваний назначается добавочный вес, а если он не нужен — так и сказано", () => {
  const strong = prescribe(120, 5, 8, pullup, 80);
  // 120 / 1.2333 = 97.3 → минус 80 тела = 17.3 → 15 при шаге 2.5
  assert.equal(strong.weight, 15);
  const weak = prescribe(85, 8, 8, pullup, 80);
  assert.equal(weak.bodyweightOnly, true);
  assert.equal(weak.weight, 0);
});

test("пересборка по истории идёт в хронологическом порядке", () => {
  const sessions = [session("b", "2026-09-10"), session("a", "2026-09-01")];
  const sets = [set("a", "squat", 100, 5, 8), set("b", "squat", 110, 5, 8)];
  const model = rebuildStrength(sessions, sets, lifts, 75);
  assert.equal(model.squat.samples, 2);
  assert.equal(model.squat.lastAt, "2026-09-10");
  assert.ok(model.squat.e1rm > 125);
});
