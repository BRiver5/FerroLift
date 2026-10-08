import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acwrOf,
  dailyLoads,
  formOf,
  monotony,
  sessionLoad,
  simulate,
  step,
  typicalSessionLoad,
  ZERO_STATE,
  zoneOf,
} from "./load.ts";
import { session, set } from "./testkit.ts";

test("нагрузка по Фостеру — тяжесть × минуты, если оба введены", () => {
  const load = sessionLoad(session("s", "2026-10-01", { rpe: 7, minutes: 60 }), []);
  assert.equal(load.load, 420);
  assert.equal(load.estimated, false);
});

test("без тяжести и времени — оценка по подходам, и это помечено", () => {
  const sets = [set("s", "squat", 100, 5, 8), set("s", "squat", 100, 5, 9), set("s", "bench", 80, 8, 7)];
  const load = sessionLoad(session("s", "2026-10-01"), sets);
  // 3 подхода × 3 мин + 10 = 19 мин; среднее RPE 8 → 152
  assert.equal(load.minutes, 19);
  assert.equal(load.rpe, 8);
  assert.equal(load.load, 152);
  assert.equal(load.estimated, true);
});

test("суточный ряд заполняет пустые дни нулями и складывает две сессии в день", () => {
  const loads = [
    { sessionId: "a", date: "2026-10-01", load: 300, rpe: 6, minutes: 50, estimated: false, sets: 5 },
    { sessionId: "b", date: "2026-10-01", load: 100, rpe: 5, minutes: 20, estimated: false, sets: 2 },
    { sessionId: "c", date: "2026-10-03", load: 400, rpe: 8, minutes: 50, estimated: false, sets: 8 },
  ];
  const series = dailyLoads(loads, "2026-10-01", "2026-10-04");
  assert.deepEqual(series.map((d) => d.load), [400, 0, 400, 0]);
});

test("тяжёлый день сразу бьёт по форме, а готовность растёт медленно", () => {
  const after = step(ZERO_STATE, 600);
  assert.ok(after.fatigue > after.fitness * 4, "усталость реагирует в разы быстрее готовности");
  assert.ok(formOf(after) < 0);
});

test("после недели отдыха усталость уходит, а готовность почти остаётся", () => {
  let state = ZERO_STATE;
  for (let i = 0; i < 28; i++) state = step(state, i % 2 === 0 ? 400 : 0);
  const loaded = { fitness: state.fitness, fatigue: state.fatigue };
  for (let i = 0; i < 7; i++) state = step(state, 0);
  assert.ok(state.fatigue < loaded.fatigue * 0.4);
  assert.ok(state.fitness > loaded.fitness * 0.8);
  assert.ok(formOf(state) > 0, "отдохнувший человек в плюсе по форме");
});

test("ACWR не определён, пока нет привычной нагрузки", () => {
  assert.equal(acwrOf(ZERO_STATE), null);
  assert.equal(zoneOf(null), null);
});

test("резкий рост нагрузки попадает в зону скачка, ровная — в нормальную", () => {
  let steady = ZERO_STATE;
  for (let i = 0; i < 60; i++) steady = step(steady, 300);
  assert.equal(zoneOf(acwrOf(steady)), "sweet");

  let spike = steady;
  for (let i = 0; i < 4; i++) spike = step(spike, 900);
  assert.equal(zoneOf(acwrOf(spike)), "spike");

  let idle = steady;
  for (let i = 0; i < 10; i++) idle = step(idle, 0);
  assert.equal(zoneOf(acwrOf(idle)), "under");
});

test("монотонность: одинаковые дни — плохо, разные — нормально", () => {
  assert.ok(monotony([300, 300, 300, 300, 300, 300, 300]) > 50);
  const varied = monotony([500, 0, 300, 0, 600, 0, 0]);
  assert.ok(varied > 0.5 && varied < 1.5);
  assert.equal(monotony([0, 0, 0]), 0);
});

test("прогон модели возвращает точку на каждый день и итоговое состояние", () => {
  const { points, end } = simulate(ZERO_STATE, [
    { date: "2026-10-01", load: 300 },
    { date: "2026-10-02", load: 0 },
  ]);
  assert.equal(points.length, 2);
  assert.equal(points[1].fitness, end.fitness);
  assert.equal(points[0].date, "2026-10-01");
});

test("типичная тренировка — медиана последних, выброс её не раздувает", () => {
  const mk = (date: string, load: number) => ({ sessionId: date, date, load, rpe: 7, minutes: 50, estimated: false, sets: 6 });
  const loads = [mk("2026-10-01", 350), mk("2026-10-03", 360), mk("2026-10-05", 340), mk("2026-10-07", 1500)];
  assert.equal(typicalSessionLoad(loads), 355);
  assert.equal(typicalSessionLoad([], 350), 350);
});
