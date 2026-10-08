// Нагрузка и модель "форма = готовность − усталость" — третье звено цепочки.
//
// Нагрузка тренировки по Фостеру: тяжесть всей сессии (CR-10) × минуты.
// Если пользователь не указал тяжесть или время — они оцениваются по
// подходам, и сессия помечается как оценённая: на экране "почему" видно,
// какие числа введены, а какие додуманы.
//
// Дальше импульсная модель Банистера в форме двух экспоненциальных средних:
//   готовность (fitness)  — EWMA нагрузки с постоянной 42 дня,
//   усталость  (fatigue)  — EWMA с постоянной 7 дней,
//   форма      (form)     — готовность − усталость.
// Это состояние, которое живёт во времени: вчерашняя тяжёлая тренировка
// сегодня всё ещё в усталости и уже чуть-чуть в готовности, а через неделю
// усталость ушла, готовность осталась.
//
// Рядом — отношение острой нагрузки к хронической (ACWR) в варианте с
// экспоненциальными средними (7 и 28 дней): резкий рост нагрузки относительно
// привычной. Зона 0.8-1.3 — нормальное наращивание, выше — скачок.

import { addDays, diffDays } from "./dates.ts";
import type { Session, SetEntry } from "./model.ts";
import { DEFAULT_RPE } from "./strength.ts";

export const TAU_FITNESS = 42;
export const TAU_FATIGUE = 7;
export const ACUTE_SPAN = 7;
export const CHRONIC_SPAN = 28;
export const ACWR_SWEET_LOW = 0.8;
export const ACWR_SWEET_HIGH = 1.3;

export type SessionLoad = {
  sessionId: string;
  date: string;
  load: number;
  rpe: number;
  minutes: number;
  /** true — тяжесть или длительность оценены по подходам, а не введены. */
  estimated: boolean;
  sets: number;
};

/**
 * Нагрузка одной сессии. Оценка длительности — 3 минуты на подход плюс 10 на
 * разминку; оценка тяжести — среднее RPE подходов. Грубо, и названо грубым.
 */
export function sessionLoad(session: Session, sets: SetEntry[]): SessionLoad {
  const own = sets.filter((set) => set.sessionId === session.id);
  const withRpe = own.filter((set) => set.rpe !== null);
  const meanSetRpe = withRpe.length
    ? withRpe.reduce((sum, set) => sum + (set.rpe as number), 0) / withRpe.length
    : DEFAULT_RPE;
  const rpe = session.rpe ?? Math.round(meanSetRpe * 2) / 2;
  const minutes = session.minutes ?? (own.length > 0 ? own.length * 3 + 10 : 0);
  return {
    sessionId: session.id,
    date: session.date,
    load: Math.round(rpe * minutes),
    rpe,
    minutes,
    estimated: session.rpe === null || session.minutes === null,
    sets: own.length,
  };
}

/** Суточные нагрузки за диапазон [from, to] включительно — пустые дни нулём. */
export function dailyLoads(loads: SessionLoad[], from: string, to: string): { date: string; load: number }[] {
  const days = Math.max(0, diffDays(from, to)) + 1;
  const byDate = new Map<string, number>();
  for (const item of loads) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.load);
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, load: byDate.get(date) ?? 0 };
  });
}

export type LoadState = {
  fitness: number;
  fatigue: number;
  acute: number;
  chronic: number;
};

export const ZERO_STATE: LoadState = { fitness: 0, fatigue: 0, acute: 0, chronic: 0 };

/** Один шаг суток: экспоненциальное сглаживание всех четырёх средних. */
export function step(state: LoadState, load: number): LoadState {
  const kFit = 1 - Math.exp(-1 / TAU_FITNESS);
  const kFat = 1 - Math.exp(-1 / TAU_FATIGUE);
  const kAcute = 2 / (ACUTE_SPAN + 1);
  const kChronic = 2 / (CHRONIC_SPAN + 1);
  return {
    fitness: state.fitness + kFit * (load - state.fitness),
    fatigue: state.fatigue + kFat * (load - state.fatigue),
    acute: state.acute + kAcute * (load - state.acute),
    chronic: state.chronic + kChronic * (load - state.chronic),
  };
}

export function formOf(state: LoadState): number {
  return state.fitness - state.fatigue;
}

/**
 * ACWR. При нулевой хронической нагрузке отношение не определено — новичок
 * в первую неделю не может "перегрузиться относительно привычного", у него
 * ещё нет привычного. Возвращается null, а не бесконечность.
 */
export function acwrOf(state: LoadState): number | null {
  if (state.chronic < 1) return null;
  return state.acute / state.chronic;
}

export type Zone = "under" | "sweet" | "spike";

export function zoneOf(acwr: number | null): Zone | null {
  if (acwr === null) return null;
  if (acwr < ACWR_SWEET_LOW) return "under";
  if (acwr <= ACWR_SWEET_HIGH) return "sweet";
  return "spike";
}

export type DayPoint = {
  date: string;
  load: number;
  fitness: number;
  fatigue: number;
  form: number;
  acwr: number | null;
};

/** Прогон модели по ряду нагрузок, начиная с заданного состояния. */
export function simulate(start: LoadState, series: { date: string; load: number }[]): { points: DayPoint[]; end: LoadState } {
  let state = start;
  const points: DayPoint[] = [];
  for (const day of series) {
    state = step(state, day.load);
    points.push({
      date: day.date,
      load: day.load,
      fitness: state.fitness,
      fatigue: state.fatigue,
      form: formOf(state),
      acwr: acwrOf(state),
    });
  }
  return { points, end: state };
}

/**
 * Монотонность недели по Фостеру: средняя суточная нагрузка / её стандартное
 * отклонение. Одинаковые тренировки каждый день дают высокую монотонность —
 * это плохо даже при умеренном объёме. Нулевой разброс — монотонность не
 * определена (возвращается большое число, а не деление на ноль).
 */
export function monotony(loads: number[]): number {
  if (loads.length === 0) return 0;
  const mean = loads.reduce((sum, value) => sum + value, 0) / loads.length;
  if (mean === 0) return 0;
  const variance = loads.reduce((sum, value) => sum + (value - mean) ** 2, 0) / loads.length;
  const sd = Math.sqrt(variance);
  return sd < 1e-9 ? 99 : mean / sd;
}

/** Типичная нагрузка тренировочного дня по последним сессиям — опора размеров плана. */
export function typicalSessionLoad(loads: SessionLoad[], fallback = 350): number {
  const recent = [...loads].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((item) => item.load).filter((v) => v > 0);
  if (recent.length < 2) return fallback;
  const sorted = [...recent].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  // Медиана, а не среднее: один марафонский день не должен раздувать "обычную" тренировку.
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
