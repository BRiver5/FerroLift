import { test } from "node:test";
import assert from "node:assert/strict";
import { groupVolume, linearTrend, liftHistory, personalRecords, tCritical, trendFor, weeklyLoads, zoneShare } from "./stats.ts";
import { presetLifts, session, set } from "./testkit.ts";

const lifts = presetLifts();
const squat = lifts.find((lift) => lift.id === "squat")!;

test("квантиль t для малых выборок шире нормального", () => {
  assert.equal(tCritical(1), 12.706);
  assert.equal(tCritical(10), 2.228);
  assert.ok(tCritical(100) > 1.96 && tCritical(100) < 2.0);
});

test("ровный рост даёт 'rising' с интервалом выше нуля", () => {
  const points = Array.from({ length: 8 }, (_, i) => ({ day: i * 3, value: 120 + i * 1.5 + (i % 2 ? 0.4 : -0.4) }));
  const trend = linearTrend(points);
  assert.equal(trend.verdict, "rising");
  assert.ok(trend.low > 0);
  // 1.5 кг за 3 дня = 3.5 кг в неделю
  assert.ok(Math.abs(trend.slopePerWeek - 3.5) < 0.3);
});

test("шум без направления — 'unclear', а не придуманный прогресс", () => {
  const values = [120, 124, 119, 123, 121, 118, 124, 120];
  const trend = linearTrend(values.map((value, i) => ({ day: i * 3, value })));
  assert.equal(trend.verdict, "unclear");
  assert.ok(trend.low < 0 && trend.high > 0);
});

test("меньше четырёх тренировок — вердикта нет", () => {
  assert.equal(linearTrend([{ day: 0, value: 100 }, { day: 3, value: 105 }, { day: 6, value: 110 }]).verdict, "too-few");
});

test("история упражнения: одна точка на тренировку и лучший подход подписью", () => {
  const sessions = [session("a", "2026-09-01"), session("b", "2026-09-04")];
  const sets = [set("a", "squat", 100, 5, 8), set("a", "squat", 110, 3, 9), set("b", "squat", 105, 5, 8), set("b", "bench", 80, 5, 8)];
  const history = liftHistory(squat, sessions, sets, 75);
  assert.equal(history.length, 2);
  // 110×3 @9 → 110 × (1 + 4/30) = 124.7 лучше, чем 100×5 @8 → 123.3
  assert.equal(history[0].topSet, "110×3 @9");
  assert.ok(history[1].e1rm > history[0].e1rm);
});

test("тренд по истории смотрит только на последние четыре месяца", () => {
  const sessions = [];
  const sets = [];
  // Старый период: падение. Свежий: рост.
  for (let i = 0; i < 6; i++) {
    sessions.push(session(`old${i}`, `2026-0${3 + Math.floor(i / 3)}-1${i % 3}`));
    sets.push(set(`old${i}`, "squat", 140 - i * 5, 5, 8));
  }
  for (let i = 0; i < 6; i++) {
    sessions.push(session(`new${i}`, `2026-09-${String(10 + i * 3).padStart(2, "0")}`));
    sets.push(set(`new${i}`, "squat", 100 + i * 2.5, 5, 8));
  }
  const trend = trendFor(liftHistory(squat, sessions, sets, 75), "2026-10-01");
  assert.equal(trend.verdict, "rising");
  assert.equal(trend.n, 6);
});

test("рекорд — лучшая оценка за всю историю, а не последняя", () => {
  const sessions = [session("a", "2026-09-01"), session("b", "2026-09-10")];
  const sets = [set("a", "squat", 120, 5, 8), set("b", "squat", 100, 5, 8)];
  const records = personalRecords(lifts, sessions, sets, 75);
  assert.equal(records[0].lift.id, "squat");
  assert.equal(records[0].date, "2026-09-01");
});

test("объём по группам и фильтр по набору сессий", () => {
  const sets = [set("a", "squat", 100, 5), set("a", "squat", 100, 5), set("a", "bench", 80, 5), set("b", "row", 70, 8)];
  const all = groupVolume(sets, lifts);
  assert.equal(all[0].group, "legs");
  assert.equal(all[0].sets, 2);
  assert.ok(Math.abs(all.reduce((s, g) => s + g.share, 0) - 1) < 1e-9);
  const onlyB = groupVolume(sets, lifts, new Set(["b"]));
  assert.deepEqual(onlyB.map((g) => g.group), ["pull"]);
});

test("недельная нагрузка раскладывается по понедельникам", () => {
  const mk = (date: string, load: number) => ({ sessionId: date, date, load, rpe: 7, minutes: 50, estimated: false, sets: 5 });
  const weeks = weeklyLoads([mk("2026-10-05", 300), mk("2026-10-07", 400), mk("2026-09-30", 200)], 2, "2026-10-08");
  assert.deepEqual(weeks.map((w) => w.weekStart), ["2026-09-28", "2026-10-05"]);
  assert.deepEqual(weeks.map((w) => w.load), [200, 700]);
  assert.deepEqual(weeks.map((w) => w.sessions), [1, 2]);
});

test("доли зон ACWR, неопределённые дни отдельно", () => {
  assert.deepEqual(zoneShare([null, 0.5, 1.0, 1.2, 1.6]), { under: 1, sweet: 2, spike: 1, unknown: 1 });
});
