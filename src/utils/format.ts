export function withAlpha(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) return hex;
  const parsed = Number.parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
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

export function parsePositiveNumber(input: string): number | null {
  const sanitized = input.replace(/[^0-9.]/g, "");
  if (!sanitized) return null;
  const value = Number(sanitized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10) / 10;
}

export function formatMetricValue(value: number | null): string {
  if (value == null) return "";
  return Number.isInteger(value) ? String(value) : String(value);
}

export function normalizeReminderLeadMinutes(values: number[]): number[] {
  const normalized = values
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));
  const deduped = Array.from(new Set(normalized));
  deduped.sort((a, b) => b - a);
  return deduped.slice(0, 3);
}

export function ensureThreeLeadInputs(values: number[]): string[] {
  const normalized = normalizeReminderLeadMinutes(values);
  return [
    String(normalized[0] ?? 60),
    String(normalized[1] ?? 30),
    String(normalized[2] ?? 15)
  ];
}
