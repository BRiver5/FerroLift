// Типы и справочник упражнений FerroLift. Пресеты упражнений — чтобы руками
// вводилось только то, что действительно меняется от подхода к подходу: вес,
// повторы, усилие.

export type MuscleGroup = "legs" | "push" | "pull" | "hinge" | "core" | "arms";
export type LiftKind = "compound" | "accessory";

export type LiftPreset = {
  key: string;
  name: string;
  group: MuscleGroup;
  kind: LiftKind;
  /** Шаг прибавки веса, кг: на базовых 2.5, на изолирующих 1. */
  increment: number;
  /** Короткие имена, которые люди реально пишут в логе. */
  aliases: string[];
  /** true — упражнение с собственным весом (подтягивания, отжимания на брусьях). */
  bodyweight?: boolean;
};

export const LIFT_PRESETS: LiftPreset[] = [
  { key: "squat", name: "Back squat", group: "legs", kind: "compound", increment: 2.5, aliases: ["squat", "sq", "bs", "back squat"] },
  { key: "front_squat", name: "Front squat", group: "legs", kind: "compound", increment: 2.5, aliases: ["fs", "front", "front squat"] },
  { key: "leg_press", name: "Leg press", group: "legs", kind: "accessory", increment: 5, aliases: ["lp", "leg press", "press legs"] },
  { key: "lunge", name: "Walking lunge", group: "legs", kind: "accessory", increment: 2, aliases: ["lunge", "lunges"] },
  { key: "split_squat", name: "Bulgarian split squat", group: "legs", kind: "accessory", increment: 2, aliases: ["bss", "split squat", "bulgarian"] },
  { key: "deadlift", name: "Deadlift", group: "hinge", kind: "compound", increment: 2.5, aliases: ["deadlift", "dl", "dead"] },
  { key: "rdl", name: "Romanian deadlift", group: "hinge", kind: "compound", increment: 2.5, aliases: ["rdl", "romanian"] },
  { key: "hip_thrust", name: "Hip thrust", group: "hinge", kind: "accessory", increment: 5, aliases: ["ht", "hip thrust", "thrust"] },
  { key: "good_morning", name: "Good morning", group: "hinge", kind: "accessory", increment: 2.5, aliases: ["gm", "good morning"] },
  { key: "bench", name: "Bench press", group: "push", kind: "compound", increment: 2.5, aliases: ["bench", "bp", "bench press"] },
  { key: "incline", name: "Incline bench", group: "push", kind: "compound", increment: 2.5, aliases: ["incline", "ib", "incline bench"] },
  { key: "ohp", name: "Overhead press", group: "push", kind: "compound", increment: 1.25, aliases: ["ohp", "press", "overhead", "military"] },
  { key: "dips", name: "Dips", group: "push", kind: "accessory", increment: 2.5, aliases: ["dips", "dip"], bodyweight: true },
  { key: "row", name: "Barbell row", group: "pull", kind: "compound", increment: 2.5, aliases: ["row", "bor", "barbell row", "bb row"] },
  { key: "pullup", name: "Pull-up", group: "pull", kind: "compound", increment: 2.5, aliases: ["pullup", "pull-up", "pu", "chin", "chinup"], bodyweight: true },
  { key: "lat_pulldown", name: "Lat pulldown", group: "pull", kind: "accessory", increment: 2.5, aliases: ["lat", "pulldown", "lpd"] },
  { key: "face_pull", name: "Face pull", group: "pull", kind: "accessory", increment: 1, aliases: ["fp", "face pull", "facepull"] },
  { key: "plank", name: "Weighted plank", group: "core", kind: "accessory", increment: 2.5, aliases: ["plank"], bodyweight: true },
  { key: "hanging_raise", name: "Hanging leg raise", group: "core", kind: "accessory", increment: 1, aliases: ["hlr", "leg raise", "hanging"], bodyweight: true },
  { key: "ab_wheel", name: "Ab wheel", group: "core", kind: "accessory", increment: 1, aliases: ["ab", "wheel", "ab wheel"], bodyweight: true },
  { key: "curl", name: "Barbell curl", group: "arms", kind: "accessory", increment: 1, aliases: ["curl", "bc", "biceps"] },
  { key: "hammer", name: "Hammer curl", group: "arms", kind: "accessory", increment: 1, aliases: ["hammer"] },
  { key: "triceps", name: "Triceps extension", group: "arms", kind: "accessory", increment: 1, aliases: ["tri", "triceps", "skull", "skullcrusher"] },
  { key: "pushdown", name: "Triceps pushdown", group: "arms", kind: "accessory", increment: 1, aliases: ["pushdown", "pd"] },
];

export type Lift = {
  id: string;
  name: string;
  group: MuscleGroup;
  kind: LiftKind;
  increment: number;
  aliases: string[];
  bodyweight: boolean;
  /** Входит ли в программу — из таких планировщик собирает тренировки. */
  inProgram: boolean;
  archivedAt: string | null;
};

export type Session = {
  id: string;
  date: string;
  /** Оценка тяжести всей тренировки по шкале Борга CR-10, null — не указана. */
  rpe: number | null;
  /** Длительность в минутах, null — не указана. */
  minutes: number | null;
  note: string;
};

export type SetEntry = {
  id: string;
  sessionId: string;
  liftId: string;
  /** Вес снаряда в кг; для упражнений с собственным весом — ДОБАВЛЕННЫЙ вес. */
  weight: number;
  reps: number;
  /** Усилие подхода (RPE 6-10), null — не указано. */
  rpe: number | null;
  /** Порядок подхода внутри сессии. */
  order: number;
};

export type SessionSize = "rest" | "light" | "moderate" | "hard";

export const SESSION_SIZES: SessionSize[] = ["rest", "light", "moderate", "hard"];

export const SIZE_LABELS: Record<SessionSize, string> = {
  rest: "Rest",
  light: "Light",
  moderate: "Moderate",
  hard: "Hard",
};

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  legs: "Legs",
  push: "Push",
  pull: "Pull",
  hinge: "Hinge",
  core: "Core",
  arms: "Arms",
};
