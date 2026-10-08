// Модель силы — накапливаемое состояние, второе звено цепочки.
//
// Для каждого упражнения приложение держит оценку разового максимума (e1RM),
// которая ОБНОВЛЯЕТСЯ каждой тренировкой, а не пересчитывается из всей
// истории заново. Наблюдение одной тренировки — лучший e1RM среди её
// подходов этого упражнения по формуле Эпли с поправкой на запас повторов:
//
//   эффективные повторы = повторы + (10 − RPE)
//   e1RM = вес × (1 + эффективные повторы / 30)
//
// Поправка — главное. "100 × 5 @6" и "100 × 5 @10" — это два разных
// человека: у первого в запасе ещё четыре повтора. Голая формула Эпли
// приравняла бы их и заставила бы модель недооценивать всех, кто тренируется
// с запасом, то есть почти всех.
//
// Если RPE не указан, предполагается запас в два повтора (RPE 8) — так
// выглядит обычный рабочий подход; предположение "до отказа" систематически
// занижало бы оценку.

import { diffDays, todayIso } from "./dates.ts";
import type { Lift, SetEntry } from "./model.ts";

export const DEFAULT_RPE = 8;
/** После 12 эффективных повторов формулы оценки максимума расходятся. */
const MAX_RELIABLE_REPS = 12;
const ALPHA_FLOOR = 0.25;
const CONFIDENCE_FULL_AT = 5;
/** Через сколько дней без тренировки доверие к оценке падает в e раз. */
const CONFIDENCE_DECAY_DAYS = 45;

export type LiftModelRow = {
  liftId: string;
  e1rm: number;
  /** EWMA квадрата отклонения — ширина коридора. */
  variance: number;
  samples: number;
  lastAt: string;
  /** Лучший когда-либо наблюдавшийся e1RM — для рекордов, не для планирования. */
  best: number;
};

export type StrengthModel = Record<string, LiftModelRow>;

export function emptyStrengthModel(): StrengthModel {
  return {};
}

/** Системный вес подхода: для упражнений с собственным весом прибавляется масса тела. */
export function systemWeight(set: Pick<SetEntry, "weight">, lift: Pick<Lift, "bodyweight">, bodyweight: number): number {
  return lift.bodyweight ? bodyweight + set.weight : set.weight;
}

export function effectiveReps(reps: number, rpe: number | null): number {
  const reserve = 10 - (rpe ?? DEFAULT_RPE);
  return reps + Math.max(0, reserve);
}

/** e1RM одного подхода. null — подход слишком длинный, чтобы ему верить. */
export function setE1rm(load: number, reps: number, rpe: number | null): number | null {
  if (load <= 0 || reps <= 0) return null;
  const eff = effectiveReps(reps, rpe);
  if (eff > MAX_RELIABLE_REPS) return null;
  return load * (1 + eff / 30);
}

/** Лучшая оценка среди подходов одной тренировки — наблюдение для модели. */
export function sessionObservation(sets: SetEntry[], lift: Lift, bodyweight: number): number | null {
  let best: number | null = null;
  for (const set of sets) {
    const value = setE1rm(systemWeight(set, lift, bodyweight), set.reps, set.rpe);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best;
}

/**
 * Учесть одну тренировку. Шаг адаптивный: на первых наблюдениях модель учится
 * быстро, дальше шаг падает до пола 0.25 — сила у живого человека меняется
 * от недели к неделе, и слишком инертная модель отставала бы от прогресса.
 *
 * Защита от опечаток: после трёх наблюдений скачок больше чем на 25% вверх
 * (или вниз) обрезается до 12%. "Присел 1000" — это лишний ноль, а не
 * рекорд, и он не должен утащить модель за собой.
 */
export function observeLift(model: StrengthModel, liftId: string, value: number, at: string): StrengthModel {
  if (!Number.isFinite(value) || value <= 0) return model;
  const previous = model[liftId];
  if (!previous) {
    return { ...model, [liftId]: { liftId, e1rm: value, variance: 0, samples: 1, lastAt: at, best: value } };
  }

  let observed = value;
  if (previous.samples >= 3) {
    const ratio = value / previous.e1rm;
    if (ratio > 1.25) observed = previous.e1rm * 1.12;
    else if (ratio < 0.75) observed = previous.e1rm * 0.88;
  }

  const alpha = Math.max(ALPHA_FLOOR, 1 / (previous.samples + 1));
  const e1rm = previous.e1rm + alpha * (observed - previous.e1rm);
  const deviation = observed - e1rm;
  const variance = previous.variance + alpha * (deviation * deviation - previous.variance);

  return {
    ...model,
    [liftId]: {
      liftId,
      e1rm,
      variance,
      samples: previous.samples + 1,
      lastAt: at > previous.lastAt ? at : previous.lastAt,
      best: Math.max(previous.best, observed),
    },
  };
}

export type StrengthEstimate = {
  e1rm: number;
  low: number;
  high: number;
  confidence: number;
  samples: number;
  daysSince: number;
};

export function estimateLift(model: StrengthModel, liftId: string, asOf: string = todayIso()): StrengthEstimate | null {
  const row = model[liftId];
  if (!row) return null;
  const daysSince = Math.max(0, diffDays(row.lastAt, asOf));
  const sigma = Math.sqrt(Math.max(0, row.variance));
  return {
    e1rm: row.e1rm,
    low: row.e1rm - sigma,
    high: row.e1rm + sigma,
    confidence: Math.min(1, row.samples / CONFIDENCE_FULL_AT) * Math.exp(-daysSince / CONFIDENCE_DECAY_DAYS),
    samples: row.samples,
    daysSince,
  };
}

/** Пересборка из всей истории — только по явной кнопке в Settings. */
export function rebuildStrength(
  sessions: { id: string; date: string }[],
  sets: SetEntry[],
  lifts: Lift[],
  bodyweight: number
): StrengthModel {
  const liftById = new Map(lifts.map((lift) => [lift.id, lift]));
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  let model = emptyStrengthModel();
  for (const session of ordered) {
    const own = sets.filter((set) => set.sessionId === session.id);
    const byLift = new Map<string, SetEntry[]>();
    for (const set of own) {
      if (!byLift.has(set.liftId)) byLift.set(set.liftId, []);
      byLift.get(set.liftId)!.push(set);
    }
    for (const [liftId, liftSets] of byLift) {
      const lift = liftById.get(liftId);
      if (!lift) continue;
      const value = sessionObservation(liftSets, lift, bodyweight);
      if (value !== null) model = observeLift(model, liftId, value, session.date);
    }
  }
  return model;
}

export type Prescription = {
  /** Вес на снаряде (для упражнений с весом тела — ДОБАВЛЕННЫЙ вес, может быть 0). */
  weight: number;
  reps: number;
  rpe: number;
  /** Доля от e1RM, для подписи "~78%". */
  intensity: number;
  /** true — на собственном весе уже тяжелее цели, отягощение не нужно. */
  bodyweightOnly: boolean;
};

/**
 * Обратная формула: какой вес даст заданное число повторов при заданном
 * усилии. Округление ВНИЗ до шага прибавки — недобор на полкилограмма
 * безопаснее, чем перебор, и тянуть его можно следующей тренировкой.
 */
export function prescribe(
  e1rm: number,
  reps: number,
  rpe: number,
  lift: Pick<Lift, "increment" | "bodyweight">,
  bodyweight: number
): Prescription {
  const eff = effectiveReps(reps, rpe);
  const load = e1rm / (1 + eff / 30);
  const target = lift.bodyweight ? load - bodyweight : load;
  const step = lift.increment > 0 ? lift.increment : 1;
  const weight = Math.max(0, Math.floor(target / step) * step);
  return {
    weight,
    reps,
    rpe,
    intensity: e1rm > 0 ? load / e1rm : 0,
    bodyweightOnly: lift.bodyweight && target <= 0,
  };
}
