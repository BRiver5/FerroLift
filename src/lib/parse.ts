// Парсер строки консоли — первое звено цепочки. На Home подходы вводятся не
// формой из пяти полей, а одной строкой, как пишут в бумажном дневнике:
//
//   squat 100x5x3 @8          три подхода по 5 с весом 100, усилие 8
//   bench 80 x 8, 8, 7 @9     три подхода по 80 с разными повторами
//   dl 140x3 150x2 160x1      лесенка: у каждого подхода свой вес
//   bench 80x8@7 80x8@8       усилие на каждом подходе отдельно
//   pullup bw+10 x6x3         собственный вес плюс отягощение
//   ohp 95lb x5               фунты переводятся в килограммы
//   session 7 60min           тяжесть и длительность всей тренировки
//
// Имя упражнения ищется нечётко: точный синоним → префикс → расстояние
// Дамерау — Левенштейна не больше 2. Неоднозначность — это ошибка с
// вариантами, а не молчаливый выбор первого попавшегося: записать "press" в
// жим лёжа вместо армейского жима хуже, чем переспросить.

import type { Lift } from "./model.ts";

export type ParsedSet = { weight: number; reps: number; rpe: number | null };

export type ParseResult =
  | { kind: "sets"; lift: Lift; sets: ParsedSet[]; bodyweight: boolean }
  | { kind: "session"; rpe: number | null; minutes: number | null }
  | { kind: "error"; message: string; suggestions: Lift[] };

const LB_TO_KG = 0.45359237;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

/** Расстояние Дамерау — Левенштейна (с транспозицией соседних букв). */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export type LiftMatch =
  | { kind: "match"; lift: Lift }
  | { kind: "ambiguous"; candidates: Lift[] }
  | { kind: "none"; suggestions: Lift[] };

export function matchLift(query: string, lifts: Lift[]): LiftMatch {
  const q = normalize(query);
  const active = lifts.filter((lift) => lift.archivedAt === null);
  if (!q) return { kind: "none", suggestions: [] };

  const namesOf = (lift: Lift) => [normalize(lift.name), ...lift.aliases.map(normalize)];

  const exact = active.filter((lift) => namesOf(lift).includes(q));
  if (exact.length === 1) return { kind: "match", lift: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const prefix = active.filter((lift) => namesOf(lift).some((name) => name.startsWith(q)));
  if (prefix.length === 1) return { kind: "match", lift: prefix[0] };
  if (prefix.length > 1) return { kind: "ambiguous", candidates: prefix.slice(0, 4) };

  const scored = active
    .map((lift) => ({ lift, distance: Math.min(...namesOf(lift).map((name) => editDistance(q, name))) }))
    .sort((a, b) => a.distance - b.distance);
  const close = scored.filter((item) => item.distance <= 2);
  // Опечатка с единственным близким кандидатом исправляется сама; если
  // близких несколько, а лучший заметно не отрывается — переспрашиваем.
  if (close.length === 1) return { kind: "match", lift: close[0].lift };
  if (close.length > 1 && close[0].distance <= 1 && close[0].distance < close[1].distance) {
    return { kind: "match", lift: close[0].lift };
  }
  if (close.length > 1) return { kind: "ambiguous", candidates: close.slice(0, 4).map((item) => item.lift) };
  return { kind: "none", suggestions: scored.slice(0, 3).map((item) => item.lift) };
}

function parseNumber(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function validRpe(value: number | null): number | null {
  if (value === null) return null;
  if (value < 5 || value > 10) return null;
  return Math.round(value * 2) / 2;
}

/**
 * Разбор строки целиком. Возвращает либо подходы, либо мету сессии, либо
 * ошибку с подсказками — никогда не "частично понял и записал".
 */
export function parseLine(input: string, lifts: Lift[]): ParseResult {
  const line = normalize(input);
  if (!line) return { kind: "error", message: "Type a lift and a set, like squat 100x5x3 @8", suggestions: [] };

  // --- мета сессии: "session 7 60min", "rpe 8", "srpe 6 45m" ---
  const session = /^(session|srpe|rpe)\b\s*(.*)$/.exec(line);
  if (session) {
    let rest = session[2];
    let minutes: number | null = null;
    rest = rest.replace(/(\d+)\s*(min|minutes|m)\b/, (_, value: string) => {
      minutes = Number(value);
      return " ";
    });
    const rpeMatch = /(\d+(?:[.,]5)?)/.exec(rest);
    const rpe = validRpe(rpeMatch ? parseNumber(rpeMatch[1]) : null);
    if (rpe === null && minutes === null) {
      return { kind: "error", message: "Session needs an effort 5-10 and/or minutes, like session 7 60min", suggestions: [] };
    }
    return { kind: "session", rpe, minutes };
  }

  // --- имя упражнения: всё до первого токена с цифрой, "bw" или "+" ---
  const tokens = line.split(" ");
  const firstData = tokens.findIndex((token) => /^(\d|bw|\+|@)/.test(token));
  if (firstData <= 0) {
    return { kind: "error", message: "Missing weight and reps — try bench 80x8", suggestions: [] };
  }
  const name = tokens.slice(0, firstData).join(" ");
  const body = tokens.slice(firstData).join(" ");

  const match = matchLift(name, lifts);
  if (match.kind === "ambiguous") {
    return {
      kind: "error",
      message: `"${name}" could be ${match.candidates.map((lift) => lift.name).join(", ")}`,
      suggestions: match.candidates,
    };
  }
  if (match.kind === "none") {
    return { kind: "error", message: `No lift called "${name}"`, suggestions: match.suggestions };
  }
  const lift = match.lift;

  // Общее усилие в конце строки ("@8") относится ко всем подходам без своего.
  let trailingRpe: number | null = null;
  let work = body.replace(/\s*@\s*(\d+(?:[.,]5)?)\s*$/, (_, value: string) => {
    trailingRpe = validRpe(parseNumber(value));
    return "";
  });

  const pounds = /\b(lb|lbs)\b/.test(work) || /\d(lb|lbs)\b/.test(work);
  work = work.replace(/(kg|kgs|lbs|lb)\b/g, "").replace(/\s+/g, " ").trim();

  const toKg = (value: number) => (pounds ? Math.round(value * LB_TO_KG * 4) / 4 : value);
  const sets: ParsedSet[] = [];
  let usesBodyweight = false;

  const weightOf = (raw: string): number | null => {
    // "bw" — ноль добавленного веса, "bw+10" и "+10" — отягощение.
    const bw = /^bw(?:\+(\d+(?:[.,]\d+)?))?$/.exec(raw);
    if (bw) {
      usesBodyweight = true;
      return bw[1] ? toKg(parseNumber(bw[1]) ?? 0) : 0;
    }
    const plus = /^\+(\d+(?:[.,]\d+)?)$/.exec(raw);
    if (plus) {
      usesBodyweight = true;
      return toKg(parseNumber(plus[1]) ?? 0);
    }
    const value = parseNumber(raw);
    return value === null ? null : toKg(value);
  };

  // Вариант 1: "80 x 8, 8, 7" — один вес, список повторов через запятую.
  const commaForm = /^(\S+?)\s*x\s*(\d+(?:\s*,\s*\d+)+)$/.exec(work);
  if (commaForm) {
    const weight = weightOf(commaForm[1]);
    if (weight === null) return { kind: "error", message: `Can't read the weight "${commaForm[1]}"`, suggestions: [] };
    for (const reps of commaForm[2].split(",")) sets.push({ weight, reps: Number(reps.trim()), rpe: trailingRpe });
  } else {
    // Вариант 2: последовательность групп "вес x повторы [x подходы] [@усилие]".
    const groups = work.replace(/\s*x\s*/g, "x").replace(/\s*@\s*/g, "@").split(" ").filter(Boolean);
    for (const group of groups) {
      const parsed = /^([^x@]+)x(\d+)(?:x(\d+))?(?:@(\d+(?:[.,]5)?))?$/.exec(group);
      if (!parsed) return { kind: "error", message: `Can't read "${group}" — expected weight x reps, like 100x5`, suggestions: [] };
      const weight = weightOf(parsed[1]);
      if (weight === null) return { kind: "error", message: `Can't read the weight "${parsed[1]}"`, suggestions: [] };
      const reps = Number(parsed[2]);
      const count = parsed[3] ? Number(parsed[3]) : 1;
      const rpe = parsed[4] ? validRpe(parseNumber(parsed[4])) : trailingRpe;
      if (count > 12) return { kind: "error", message: `${count} sets in one go looks like a typo`, suggestions: [] };
      for (let i = 0; i < count; i++) sets.push({ weight, reps, rpe });
    }
  }

  if (sets.length === 0) return { kind: "error", message: "No sets found", suggestions: [] };
  for (const set of sets) {
    if (!Number.isFinite(set.reps) || set.reps <= 0 || set.reps > 50) {
      return { kind: "error", message: `${set.reps} reps is outside 1-50`, suggestions: [] };
    }
    if (set.weight < 0 || set.weight > 600) {
      return { kind: "error", message: `${set.weight} kg looks like a typo`, suggestions: [] };
    }
  }
  if (sets.some((set) => set.weight === 0) && !lift.bodyweight && !usesBodyweight) {
    return { kind: "error", message: `${lift.name} needs a weight — bw is only for bodyweight lifts`, suggestions: [] };
  }

  return { kind: "sets", lift, sets, bodyweight: usesBodyweight || lift.bodyweight };
}

export function formatWeight(kg: number): string {
  if (kg === 0) return "BW";
  if (Number.isInteger(kg)) return String(kg);
  return String(Math.round(kg * 100) / 100);
}

/** Подходы обратно в короткий текст — для чипа предпросмотра и "повторить". */
export function describeSets(sets: ParsedSet[]): string {
  if (sets.length === 0) return "";
  const sameWeight = sets.every((set) => set.weight === sets[0].weight);
  const sameReps = sets.every((set) => set.reps === sets[0].reps);
  const sameRpe = sets.every((set) => set.rpe === sets[0].rpe);
  const rpeTail = sameRpe && sets[0].rpe !== null ? ` @${sets[0].rpe}` : "";
  if (sameWeight && sameReps) {
    return `${formatWeight(sets[0].weight)} × ${sets[0].reps}${sets.length > 1 ? ` × ${sets.length}` : ""}${rpeTail}`;
  }
  if (sameWeight) return `${formatWeight(sets[0].weight)} × ${sets.map((set) => set.reps).join(", ")}${rpeTail}`;
  return (
    sets
      .map((set) => `${formatWeight(set.weight)}×${set.reps}${!sameRpe && set.rpe !== null ? `@${set.rpe}` : ""}`)
      .join("  ") + rpeTail
  );
}
