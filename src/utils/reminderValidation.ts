import { zonedDateTimeToTimestamp } from "./timezone";

export type ReminderDateParts = {
  year: number;
  month: number;
  day: number;
};

export function parseReminderDateParts(value: string): ReminderDateParts | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

export function validateOneTimeReminder(input: {
  dateLabel: string;
  hour: number;
  minute: number;
  timeZone: string;
  nowMs?: number;
  minimumLeadMs?: number;
}): string | null {
  const dateParts = parseReminderDateParts(input.dateLabel);
  if (!dateParts) return "Use a valid date in YYYY-MM-DD format.";

  const occurrenceTimestamp = zonedDateTimeToTimestamp(
    dateParts.year,
    dateParts.month,
    dateParts.day,
    input.hour,
    input.minute,
    input.timeZone
  );
  const nowMs = input.nowMs ?? Date.now();
  const minimumLeadMs = Math.max(0, Math.floor(input.minimumLeadMs ?? 5_000));
  if (occurrenceTimestamp <= nowMs + minimumLeadMs) {
    return "Choose a time in the future for a one-time reminder.";
  }

  return null;
}
