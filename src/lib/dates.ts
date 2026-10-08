// Даты — только ISO-строки "YYYY-MM-DD" в локальном времени. toISOString()
// даёт UTC и в вечерних поясах сдвигает дату на сутки назад, поэтому строка
// собирается руками из локальных компонент.

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function diffDays(from: string, to: string): number {
  return Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86400000);
}

export function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatShort(iso: string): string {
  const date = fromIso(iso);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function formatMonth(key: string): string {
  const [, m] = key.split("-").map(Number);
  return MONTHS[(m ?? 1) - 1];
}

/** "today" / "2d ago" / "3 weeks ago" — возраст котировки в списке. */
export function describeAge(iso: string, from: string = todayIso()): string {
  const days = diffDays(iso, from);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function lastWeekStarts(count: number, from: string = todayIso()): string[] {
  const date = fromIso(from);
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  const current = toIso(date);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(current, -7 * i));
  return out;
}

export function lastMonthKeys(count: number, from: string = todayIso()): string[] {
  const date = fromIso(from);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
    out.push(monthKey(toIso(d)));
  }
  return out;
}

/** 0 — понедельник, 6 — воскресенье. */
export function weekdayIndex(iso: string): number {
  return (fromIso(iso).getDay() + 6) % 7;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function weekdayShort(iso: string): string {
  return WEEKDAYS[weekdayIndex(iso)];
}

export function weekdayName(index: number): string {
  return WEEKDAYS[((index % 7) + 7) % 7];
}

/** Последовательность ISO-дат [from, from+count). */
export function dayRange(from: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(from, i));
}
