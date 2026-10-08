// Общее состояние приложения. Экраны читают отсюда и зовут действия; SQL и
// движок живут этажом ниже (src/data/*, src/lib/*).

import { create } from "zustand";
import { DEFAULT_SETTINGS, planWeek, type EngineInput, type TrainingSettings, type WeekPlan } from "../lib/engine.ts";
import { todayIso } from "../lib/dates.ts";
import type { Lift, Session, SessionSize, SetEntry } from "../lib/model.ts";
import type { ParsedSet } from "../lib/parse.ts";
import { emptyStrengthModel, rebuildStrength, type StrengthModel } from "../lib/strength.ts";
import {
  addSets,
  clearOverrides,
  deleteSession as deleteSessionRow,
  deleteSet as deleteSetRow,
  ensureCatalog,
  listLifts,
  listSessions,
  listSets,
  loadOverrides,
  loadStrengthModel,
  replaceStrengthModel,
  saveLift as saveLiftRow,
  sessionForDate,
  setOverride,
  updateSession as updateSessionRow,
} from "../data/repo";
import { loadTrainingSettings, persistTrainingSettings } from "../data/settings";

type State = {
  ready: boolean;
  lifts: Lift[];
  sessions: Session[];
  sets: SetEntry[];
  strength: StrengthModel;
  settings: TrainingSettings;
  overrides: Record<string, SessionSize>;

  init: () => Promise<void>;
  input: () => EngineInput;
  week: () => WeekPlan;

  logSets: (date: string, lift: Lift, entries: ParsedSet[]) => Promise<void>;
  setSessionMeta: (date: string, patch: { rpe?: number | null; minutes?: number | null; note?: string }) => Promise<void>;
  removeSet: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;

  saveLift: (lift: Lift) => Promise<void>;
  updateSettings: (patch: Partial<TrainingSettings>) => Promise<void>;
  updateConstraints: (patch: Partial<TrainingSettings["constraints"]>) => Promise<void>;

  lockDay: (date: string, size: SessionSize | null) => Promise<void>;
  clearLocks: () => Promise<void>;

  relearnStrength: () => Promise<void>;
  forgetStrength: () => Promise<void>;
};

let weekCache: { key: unknown[]; today: string; value: WeekPlan } | null = null;

export const useAppStore = create<State>((set, get) => ({
  ready: false,
  lifts: [],
  sessions: [],
  sets: [],
  strength: emptyStrengthModel(),
  settings: DEFAULT_SETTINGS,
  overrides: {},

  init: async () => {
    await ensureCatalog();
    const [lifts, sessions, sets, strength, settings, overrides] = await Promise.all([
      listLifts(),
      listSessions(),
      listSets(),
      loadStrengthModel(),
      loadTrainingSettings(),
      loadOverrides(),
    ]);
    // Фиксации из прошлого не нужны планировщику — он смотрит только вперёд.
    const today = todayIso();
    const fresh: Record<string, SessionSize> = {};
    for (const [date, size] of Object.entries(overrides)) if (date >= today) fresh[date] = size;
    set({ ready: true, lifts, sessions, sets, strength, settings, overrides: fresh });
  },

  input: () => {
    const { lifts, sessions, sets, strength, settings, overrides } = get();
    return {
      lifts,
      sessions,
      sets,
      strength,
      settings: { ...settings, constraints: { ...settings.constraints, locked: overrides } },
    };
  },

  // Перебор недели — десятки миллисекунд на десктопе и заметно дольше на
  // телефоне, а его спрашивают четыре экрана. Кэш по ССЫЛКАМ на входные
  // данные: стор всегда заменяет массивы при изменении, поэтому совпадение
  // ссылок = совпадение данных. Дата тоже часть ключа — в полночь план другой.
  week: () => {
    const { lifts, sessions, sets, strength, settings, overrides } = get();
    const key = [lifts, sessions, sets, strength, settings, overrides];
    const today = todayIso();
    if (weekCache && weekCache.today === today && weekCache.key.every((item, i) => item === key[i])) return weekCache.value;
    const value = planWeek(get().input());
    weekCache = { key, today, value };
    return value;
  },

  logSets: async (date, lift, entries) => {
    const { sessions, sets, strength, settings } = get();
    const session = await sessionForDate(date, sessions);
    const nextOrder = sets.reduce((max, item) => Math.max(max, item.order), 0) + 1;
    const result = await addSets(session, lift, entries, nextOrder, strength, settings.bodyweight);
    const nextSessions = sessions.some((item) => item.id === session.id) ? sessions : [session, ...sessions];
    // Записанная тренировка закрывает фиксацию этого дня — план на сегодня уже
    // не нужен, есть факт.
    const overrides = { ...get().overrides };
    if (overrides[date]) {
      delete overrides[date];
      await setOverride(date, null);
    }
    set({ sessions: nextSessions, sets: [...sets, ...result.sets], strength: result.model, overrides });
  },

  setSessionMeta: async (date, patch) => {
    const session = await sessionForDate(date, get().sessions);
    const next: Session = { ...session, ...patch };
    await updateSessionRow(next);
    const exists = get().sessions.some((item) => item.id === next.id);
    set({ sessions: exists ? get().sessions.map((item) => (item.id === next.id ? next : item)) : [next, ...get().sessions] });
  },

  removeSet: async (id) => {
    await deleteSetRow(id);
    set({ sets: get().sets.filter((item) => item.id !== id) });
  },

  removeSession: async (id) => {
    await deleteSessionRow(id);
    set({ sessions: get().sessions.filter((item) => item.id !== id), sets: get().sets.filter((item) => item.sessionId !== id) });
  },

  saveLift: async (lift) => {
    await saveLiftRow(lift);
    const exists = get().lifts.some((item) => item.id === lift.id);
    const lifts = exists ? get().lifts.map((item) => (item.id === lift.id ? lift : item)) : [...get().lifts, lift];
    set({ lifts: lifts.sort((a, b) => a.name.localeCompare(b.name)) });
  },

  updateSettings: async (patch) => {
    const settings = { ...get().settings, ...patch };
    await persistTrainingSettings(settings);
    set({ settings });
  },

  updateConstraints: async (patch) => {
    const settings = { ...get().settings, constraints: { ...get().settings.constraints, ...patch } };
    await persistTrainingSettings(settings);
    set({ settings });
  },

  lockDay: async (date, size) => {
    await setOverride(date, size);
    const overrides = { ...get().overrides };
    if (size === null) delete overrides[date];
    else overrides[date] = size;
    set({ overrides });
  },

  clearLocks: async () => {
    await clearOverrides();
    set({ overrides: {} });
  },

  relearnStrength: async () => {
    const { sessions, sets, lifts, settings } = get();
    const model = rebuildStrength(sessions, sets, lifts, settings.bodyweight);
    await replaceStrengthModel(model);
    set({ strength: model });
  },

  forgetStrength: async () => {
    await replaceStrengthModel({});
    set({ strength: emptyStrengthModel() });
  },
}));
