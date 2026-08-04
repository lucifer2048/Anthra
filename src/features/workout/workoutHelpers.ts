export function withAlpha(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) return hex;
  const parsed = Number.parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function formatHistoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function parsePositiveNumber(input: string): number | null {
  const sanitized = input.replace(/[^0-9.]/g, "");
  if (!sanitized) return null;
  const value = Number(sanitized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10) / 10;
}

export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function parseStrictWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

export function normalizeReminderLeadMinutes(values: number[]): number[] {
  const normalized = values
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));
  const deduped = Array.from(new Set(normalized));
  deduped.sort((a, b) => b - a);
  return deduped.slice(0, 3);
}

export function formatTimeLabel(hour: number, minute: number): string {
  const safeHour = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(Number(minute) || 0)));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}
