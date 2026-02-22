export const WEEKDAY_OPTIONS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" }
] as const;

export function normalizeDays(days: number[]): number[] {
  return Array.from(
    new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))
  ).sort((a, b) => a - b);
}

export function serializeDays(days: number[]): string {
  return normalizeDays(days).join(",");
}

export function parseDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  const parsed = raw
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((value) => Number.isInteger(value));
  return normalizeDays(parsed);
}

export function formatDays(days: number[]): string {
  const normalized = normalizeDays(days);
  if (normalized.length === 0) return "Any day";
  if (normalized.length === 7) return "Every day";
  return WEEKDAY_OPTIONS.filter((day) => normalized.includes(day.value))
    .map((day) => day.short)
    .join(", ");
}

export function matchesDay(days: number[], day: number): boolean {
  const normalized = normalizeDays(days);
  if (normalized.length === 0) return true;
  return normalized.includes(day);
}
