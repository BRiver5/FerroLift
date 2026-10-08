import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSets, editDistance, matchLift, parseLine } from "./parse.ts";
import { presetLifts } from "./testkit.ts";

const lifts = presetLifts();

function sets(line: string) {
  const result = parseLine(line, lifts);
  assert.equal(result.kind, "sets", result.kind === "error" ? result.message : "");
  return result as Extract<typeof result, { kind: "sets" }>;
}

test("вес × повторы × подходы с общим усилием", () => {
  const r = sets("squat 100x5x3 @8");
  assert.equal(r.lift.id, "squat");
  assert.equal(r.sets.length, 3);
  assert.deepEqual(r.sets[0], { weight: 100, reps: 5, rpe: 8 });
});

test("один вес и список повторов через запятую", () => {
  const r = sets("bench 80 x 8, 8, 7 @9");
  assert.deepEqual(r.sets.map((s) => s.reps), [8, 8, 7]);
  assert.ok(r.sets.every((s) => s.weight === 80 && s.rpe === 9));
});

test("лесенка с разными весами", () => {
  const r = sets("dl 140x3 150x2 160x1");
  assert.equal(r.lift.id, "deadlift");
  assert.deepEqual(r.sets.map((s) => s.weight), [140, 150, 160]);
  assert.ok(r.sets.every((s) => s.rpe === null));
});

test("усилие на каждом подходе отдельно побеждает общее", () => {
  const r = sets("bench 80x8@7 80x8@8 80x7 @9");
  assert.deepEqual(r.sets.map((s) => s.rpe), [7, 8, 9]);
});

test("собственный вес и отягощение", () => {
  const plain = sets("pullup bw x8x3");
  assert.ok(plain.sets.every((s) => s.weight === 0));
  assert.equal(plain.bodyweight, true);
  const loaded = sets("pullup bw+10 x6x3");
  assert.ok(loaded.sets.every((s) => s.weight === 10 && s.reps === 6));
  const shorthand = sets("dips +20x8");
  assert.equal(shorthand.sets[0].weight, 20);
});

test("фунты переводятся в килограммы с шагом 0.25", () => {
  const r = sets("ohp 95lb x5");
  assert.equal(r.sets[0].weight, 43);
  const spaced = sets("ohp 95 lbs x5");
  assert.equal(spaced.sets[0].weight, 43);
});

test("запятая как десятичный разделитель и пробелы вокруг x", () => {
  const r = sets("ohp 42,5 x 5 x 3");
  assert.equal(r.sets[0].weight, 42.5);
  assert.equal(r.sets.length, 3);
});

test("мета сессии: тяжесть и минуты в любом порядке", () => {
  assert.deepEqual(parseLine("session 7 60min", lifts), { kind: "session", rpe: 7, minutes: 60 });
  assert.deepEqual(parseLine("session 45m 8.5", lifts), { kind: "session", rpe: 8.5, minutes: 45 });
  assert.deepEqual(parseLine("rpe 6", lifts), { kind: "session", rpe: 6, minutes: null });
  assert.equal(parseLine("session", lifts).kind, "error");
});

test("опечатка в названии исправляется, если кандидат один", () => {
  assert.equal(sets("sqaut 100x5").lift.id, "squat");
  assert.equal(sets("deadlfit 140x3").lift.id, "deadlift");
});

test("однозначный префикс принимается, неоднозначный — ошибка с вариантами", () => {
  // "incl" — префикс только у incline bench.
  assert.equal(sets("incl 60x8").lift.id, "incline");
  // "b" — префикс у bench, bss, bor, bc...: молча выбрать первый нельзя.
  const vague = parseLine("b 60x8", lifts);
  assert.equal(vague.kind, "error");
  if (vague.kind === "error") assert.ok(vague.suggestions.length > 1);
});

test("неизвестное упражнение подсказывает ближайшие", () => {
  const r = parseLine("zzzz 50x5", lifts);
  assert.equal(r.kind, "error");
  if (r.kind === "error") {
    assert.ok(r.message.includes("No lift"));
    assert.equal(r.suggestions.length, 3);
  }
});

test("абсурдные числа отбраковываются", () => {
  assert.equal(parseLine("squat 1000x5", lifts).kind, "error");
  assert.equal(parseLine("squat 100x80", lifts).kind, "error");
  assert.equal(parseLine("squat 100x5x40", lifts).kind, "error");
  assert.equal(parseLine("squat", lifts).kind, "error");
});

test("явный bw — это вес тела даже у штанги, а голый ноль — ошибка", () => {
  // "squat bw x10" — приседания без штанги: пользователь сказал это явно.
  assert.equal(sets("squat bw x10").bodyweight, true);
  // "bench 0x10" — скорее пропущенная цифра, чем жим пустого воздуха.
  assert.equal(parseLine("bench 0x10", lifts).kind, "error");
});

test("усилие вне 5-10 не принимается за число", () => {
  const r = sets("bench 80x8 @12");
  assert.equal(r.sets[0].rpe, null);
});

test("архивное упражнение не находится", () => {
  const archived = lifts.map((lift) => (lift.id === "squat" ? { ...lift, archivedAt: "2026-10-01" } : lift));
  assert.notEqual(matchLift("back squat", archived).kind, "match");
});

test("расстояние Дамерау — Левенштейна считает транспозицию за одну правку", () => {
  assert.equal(editDistance("sqaut", "squat"), 1);
  assert.equal(editDistance("bench", "bench"), 0);
  assert.equal(editDistance("", "abc"), 3);
});

test("подходы обратно в короткий текст", () => {
  assert.equal(describeSets(sets("squat 100x5x3 @8").sets), "100 × 5 × 3 @8");
  assert.equal(describeSets(sets("bench 80 x 8, 8, 7").sets), "80 × 8, 8, 7");
  assert.equal(describeSets(sets("pullup bw x8").sets), "BW × 8");
});
