// Настройки тренировок в таблице settings. Значения по умолчанию живут в
// engine.ts / planner.ts — здесь только чтение, запись и разбор.

import { DEFAULT_SETTINGS, type TrainingSettings } from "../lib/engine.ts";
import { loadSettingsRaw, saveSettingRaw } from "./repo";

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadTrainingSettings(): Promise<TrainingSettings> {
  const raw = await loadSettingsRaw();
  const c = DEFAULT_SETTINGS.constraints;
  return {
    bodyweight: num(raw.bodyweight, DEFAULT_SETTINGS.bodyweight),
    horizonDays: DEFAULT_SETTINGS.horizonDays,
    target: raw.peakDate ? { kind: "peak", date: raw.peakDate } : { kind: "build" },
    constraints: {
      acwrCap: num(raw.acwrCap, c.acwrCap),
      allowBackToBackHard: raw.allowBackToBackHard === "1",
      availableWeekdays: raw.availableWeekdays
        ? raw.availableWeekdays.split(",").map(Number).filter((day) => day >= 0 && day <= 6)
        : c.availableWeekdays,
      minTrainingDays: num(raw.minTrainingDays, c.minTrainingDays),
      maxTrainingDays: num(raw.maxTrainingDays, c.maxTrainingDays),
      maxFitnessDropPct: num(raw.maxFitnessDropPct, c.maxFitnessDropPct),
      locked: {},
    },
  };
}

export async function persistTrainingSettings(settings: TrainingSettings): Promise<void> {
  const c = settings.constraints;
  await saveSettingRaw("bodyweight", String(settings.bodyweight));
  await saveSettingRaw("peakDate", settings.target.kind === "peak" ? settings.target.date : "");
  await saveSettingRaw("acwrCap", String(c.acwrCap));
  await saveSettingRaw("allowBackToBackHard", c.allowBackToBackHard ? "1" : "0");
  await saveSettingRaw("availableWeekdays", c.availableWeekdays.join(","));
  await saveSettingRaw("minTrainingDays", String(c.minTrainingDays));
  await saveSettingRaw("maxTrainingDays", String(c.maxTrainingDays));
  await saveSettingRaw("maxFitnessDropPct", String(c.maxFitnessDropPct));
}
