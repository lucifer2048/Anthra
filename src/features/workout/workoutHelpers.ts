export {
  digitsOnly,
  normalizeReminderLeadMinutes,
  parsePositiveNumber,
  parseStrictWholeNumber,
  withAlpha
} from "../../utils/format";

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

export function formatTimeLabel(hour: number, minute: number): string {
  const safeHour = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(Number(minute) || 0)));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}
