// Программа — пятое звено: размер дня из планировщика плюс накопленная модель
// силы превращаются в конкретные подходы с конкретными весами.
//
// Цепочка здесь буквальная: planner решает "четверг — тяжёлый", strength.ts
// знает "присед ~142 кг e1RM", и только вместе они дают "присед 125 × 3 × 4
// @8.5". Ни одно звено по отдельности этого числа не знает.
//
// Ротация: упражнения программы делятся на два набора (A — ноги, жим, кор;
// B — тяга с пола, тяга к себе, руки) и чередуются по тренировочным дням
// недели, чтобы каждая группа получала нагрузку примерно дважды в неделю,
// а не ноги три дня подряд.

import type { Lift, MuscleGroup, SessionSize } from "./model.ts";
import { estimateLift, prescribe, type Prescription, type StrengthModel } from "./strength.ts";

const ROTATION_A: MuscleGroup[] = ["legs", "push", "core"];
const ROTATION_B: MuscleGroup[] = ["hinge", "pull", "arms"];

type Recipe = { compound: number; accessory: number; rpe: number; compoundReps: number; accessoryReps: number; compoundSets: number; accessorySets: number };

const RECIPES: Record<Exclude<SessionSize, "rest">, Recipe> = {
  light: { compound: 1, accessory: 1, rpe: 6.5, compoundReps: 5, accessoryReps: 12, compoundSets: 3, accessorySets: 2 },
  moderate: { compound: 2, accessory: 1, rpe: 7.5, compoundReps: 5, accessoryReps: 10, compoundSets: 3, accessorySets: 3 },
  hard: { compound: 2, accessory: 2, rpe: 8.5, compoundReps: 3, accessoryReps: 8, compoundSets: 4, accessorySets: 3 },
};

export type PrescribedLift = {
  lift: Lift;
  sets: number;
  /** null — модель ещё не знает это упражнение, вес подбирается на месте. */
  prescription: Prescription | null;
  reps: number;
  rpe: number;
};

export type DayProgram = {
  rotation: "A" | "B";
  lifts: PrescribedLift[];
};

function pick(lifts: Lift[], groups: MuscleGroup[], kind: Lift["kind"], count: number): Lift[] {
  const pool = lifts.filter((lift) => lift.kind === kind && groups.includes(lift.group));
  // Порядок групп внутри ротации важен: первым идёт основное движение дня.
  pool.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.name.localeCompare(b.name));
  const chosen: Lift[] = [];
  const usedGroups = new Set<MuscleGroup>();
  // Сначала по одному упражнению на группу, потом добор — иначе два жима и ни одного приседа.
  for (const lift of pool) {
    if (chosen.length >= count) break;
    if (usedGroups.has(lift.group)) continue;
    chosen.push(lift);
    usedGroups.add(lift.group);
  }
  for (const lift of pool) {
    if (chosen.length >= count) break;
    if (!chosen.includes(lift)) chosen.push(lift);
  }
  return chosen;
}

export function programForDay(
  size: SessionSize,
  rotationIndex: number,
  lifts: Lift[],
  strength: StrengthModel,
  bodyweight: number,
  asOf: string
): DayProgram | null {
  if (size === "rest") return null;
  const recipe = RECIPES[size];
  const program = lifts.filter((lift) => lift.inProgram && lift.archivedAt === null);
  const rotation: "A" | "B" = rotationIndex % 2 === 0 ? "A" : "B";
  const groups = rotation === "A" ? ROTATION_A : ROTATION_B;

  const chosen = [
    ...pick(program, groups, "compound", recipe.compound),
    ...pick(program, groups, "accessory", recipe.accessory),
  ];

  return {
    rotation,
    lifts: chosen.map((lift) => {
      const reps = lift.kind === "compound" ? recipe.compoundReps : recipe.accessoryReps;
      const estimate = estimateLift(strength, lift.id, asOf);
      return {
        lift,
        sets: lift.kind === "compound" ? recipe.compoundSets : recipe.accessorySets,
        reps,
        rpe: recipe.rpe,
        prescription: estimate ? prescribe(estimate.e1rm, reps, recipe.rpe, lift, bodyweight) : null,
      };
    }),
  };
}
