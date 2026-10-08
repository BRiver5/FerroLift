// Статистика — последнее звено цепочки.
//
// Про порог достоверности. Вопрос "я правда прогрессирую в приседе?" — это
// вопрос о НАКЛОНЕ ряда во времени, и честный инструмент для него —
// доверительный интервал наклона линейной регрессии (t-распределение с n−2
// степенями свободы). Не интервал Уилсона (Upkept: доля успехов), не бутстрэп
// медианы (BlockDay: скошенные отношения), не знаковый критерий (RateHop:
// парные сравнения) — инструмент подбирается под форму данных.
//
// Вывод "растёт" или "падает" печатается, только если весь 95%-й интервал
// наклона по одну сторону от нуля. Иначе — "пока неясно", и это ответ.

import { addDays, diffDays, lastWeekStarts, todayIso } from "./dates.ts";
import type { SessionLoad } from "./load.ts";
import type { Lift, MuscleGroup, Session, SetEntry } from "./model.ts";
import { sessionObservation, setE1rm, systemWeight } from "./strength.ts";

/** Двусторонние 97.5%-е квантили t-распределения для df = 1..30. */
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11,
  2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

export function tCritical(df: number): number {
  if (df < 1) return Number.POSITIVE_INFINITY;
  if (df <= 30) return T_975[df - 1];
  return 1.96 + 2.4 / df;
}

export type Trend = {
  n: number;
  /** Наклон в кг e1RM в неделю. */
  slopePerWeek: number;
  low: number;
  high: number;
  verdict: "rising" | "falling" | "unclear" | "too-few";
};

/** МНК-наклон с 95%-м интервалом. Точки — (день, значение). */
export function linearTrend(points: { day: number; value: number }[]): Trend {
  const n = points.length;
  if (n < 4) return { n, slopePerWeek: 0, low: 0, high: 0, verdict: "too-few" };
  const meanX = points.reduce((sum, p) => sum + p.day, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.day - meanX) ** 2;
    sxy += (p.day - meanX) * (p.value - meanY);
  }
  if (sxx === 0) return { n, slopePerWeek: 0, low: 0, high: 0, verdict: "too-few" };
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (const p of points) sse += (p.value - (intercept + slope * p.day)) ** 2;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  const t = tCritical(n - 2);
  const low = (slope - t * se) * 7;
  const high = (slope + t * se) * 7;
  const verdict = low > 0 ? "rising" : high < 0 ? "falling" : "unclear";
  return { n, slopePerWeek: slope * 7, low, high, verdict };
}

export type LiftHistoryPoint = { date: string; e1rm: number; topSet: string };

/** Наблюдения по тренировкам для одного упражнения — для графика и тренда. */
export function liftHistory(lift: Lift, sessions: Session[], sets: SetEntry[], bodyweight: number): LiftHistoryPoint[] {
  const points: LiftHistoryPoint[] = [];
  for (const session of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const own = sets.filter((set) => set.sessionId === session.id && set.liftId === lift.id);
    if (own.length === 0) continue;
    const value = sessionObservation(own, lift, bodyweight);
    if (value === null) continue;
    let top = own[0];
    for (const set of own) {
      const a = setE1rm(systemWeight(set, lift, bodyweight), set.reps, set.rpe) ?? 0;
      const b = setE1rm(systemWeight(top, lift, bodyweight), top.reps, top.rpe) ?? 0;
      if (a > b) top = set;
    }
    points.push({ date: session.date, e1rm: value, topSet: `${top.weight}×${top.reps}${top.rpe !== null ? ` @${top.rpe}` : ""}` });
  }
  return points;
}

export function trendFor(history: LiftHistoryPoint[], asOf: string = todayIso(), windowDays = 120): Trend {
  const recent = history.filter((point) => diffDays(point.date, asOf) <= windowDays);
  return linearTrend(recent.map((point) => ({ day: -diffDays(point.date, asOf), value: point.e1rm })));
}

export type WeekBar = { weekStart: string; load: number; sessions: number };

export function weeklyLoads(loads: SessionLoad[], weeks = 8, asOf: string = todayIso()): WeekBar[] {
  return lastWeekStarts(weeks, asOf).map((weekStart) => {
    const end = addDays(weekStart, 6);
    const inWeek = loads.filter((item) => item.date >= weekStart && item.date <= end);
    return { weekStart, load: inWeek.reduce((sum, item) => sum + item.load, 0), sessions: inWeek.length };
  });
}

export type GroupSlice = { group: MuscleGroup; sets: number; share: number };

/** Сколько рабочих подходов ушло на каждую группу мышц. */
export function groupVolume(sets: SetEntry[], lifts: Lift[], sessionIds?: Set<string>): GroupSlice[] {
  const liftById = new Map(lifts.map((lift) => [lift.id, lift]));
  const counts = new Map<MuscleGroup, number>();
  for (const set of sets) {
    if (sessionIds && !sessionIds.has(set.sessionId)) continue;
    const lift = liftById.get(set.liftId);
    if (!lift) continue;
    counts.set(lift.group, (counts.get(lift.group) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...counts.entries()]
    .map(([group, count]) => ({ group, sets: count, share: count / total }))
    .sort((a, b) => b.sets - a.sets);
}

export type Record_ = { lift: Lift; best: number; date: string; topSet: string };

export function personalRecords(lifts: Lift[], sessions: Session[], sets: SetEntry[], bodyweight: number): Record_[] {
  const records: Record_[] = [];
  for (const lift of lifts) {
    const history = liftHistory(lift, sessions, sets, bodyweight);
    if (history.length === 0) continue;
    const best = history.reduce((top, point) => (point.e1rm > top.e1rm ? point : top), history[0]);
    records.push({ lift, best: best.e1rm, date: best.date, topSet: best.topSet });
  }
  return records.sort((a, b) => b.best - a.best);
}

export type ZoneShare = { under: number; sweet: number; spike: number; unknown: number };

export function zoneShare(acwrs: (number | null)[], low = 0.8, high = 1.3): ZoneShare {
  const share: ZoneShare = { under: 0, sweet: 0, spike: 0, unknown: 0 };
  for (const value of acwrs) {
    if (value === null) share.unknown += 1;
    else if (value < low) share.under += 1;
    else if (value <= high) share.sweet += 1;
    else share.spike += 1;
  }
  return share;
}

export type ActivityWeek = { weekStart: string; counts: number[] };

export function sessionActivity(loads: SessionLoad[], weeks = 12, asOf: string = todayIso()): ActivityWeek[] {
  return lastWeekStarts(weeks, asOf).map((weekStart) => ({
    weekStart,
    counts: Array.from({ length: 7 }, (_, day) =>
      loads.filter((item) => item.date === addDays(weekStart, day)).reduce((sum, item) => sum + item.load, 0)
    ),
  }));
}
