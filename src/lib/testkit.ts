// Общие фабрики для тестов движка. Не импортируется приложением.

import { LIFT_PRESETS, type Lift, type Session, type SetEntry } from "./model.ts";

export function presetLifts(inProgram: string[] = ["squat", "bench", "deadlift", "row", "ohp", "pullup", "curl", "plank", "rdl", "face_pull", "lunge", "triceps"]): Lift[] {
  return LIFT_PRESETS.map((preset) => ({
    id: preset.key,
    name: preset.name,
    group: preset.group,
    kind: preset.kind,
    increment: preset.increment,
    aliases: preset.aliases,
    bodyweight: Boolean(preset.bodyweight),
    inProgram: inProgram.includes(preset.key),
    archivedAt: null,
  }));
}

export function session(id: string, date: string, over: Partial<Session> = {}): Session {
  return { id, date, rpe: null, minutes: null, note: "", ...over };
}

let counter = 0;

export function set(sessionId: string, liftId: string, weight: number, reps: number, rpe: number | null = null): SetEntry {
  counter += 1;
  return { id: `set-${counter}`, sessionId, liftId, weight, reps, rpe, order: counter };
}
