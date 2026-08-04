import { formatDays, normalizeDays } from "../../constants/schedule";
import type { ReminderItem, ReminderMode, ReminderTimeSlot } from "../../types";
import { parseReminderDateParts } from "../../utils/reminderValidation";
import {
  formatTimestampInTimeZone,
  getDayPartsInTimeZone,
  getDeviceTimeZone,
  getTodayLabelInTimeZone,
  zonedDateTimeToTimestamp
} from "../../utils/timezone";

export type ReminderFormState = {
  id?: number;
  title: string;
  mode: ReminderMode;
  hour: string;
  minute: string;
  dateLabel: string;
  note: string;
  days: number[];
  timeSlots: string[];
  intervalMinutes: string;
  intervalStartHour: string;
  intervalStartMinute: string;
  intervalEndHour: string;
  intervalEndMinute: string;
  enabled: boolean;
};

export type ReminderHistoryItem = {
  reminderId: number;
  occurrenceTs: number;
  title: string;
  note: string;
  mode: ReminderMode;
  timezone: string;
  done: boolean;
};

export type ReminderCalendarDay = {
  dateLabel: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
};

export const INITIAL_REMINDER_FORM: ReminderFormState = {
  title: "",
  mode: "time",
  hour: "9",
  minute: "0",
  dateLabel: "",
  note: "",
  days: [],
  timeSlots: ["08:00", "13:00", "20:00", ""],
  intervalMinutes: "60",
  intervalStartHour: "8",
  intervalStartMinute: "0",
  intervalEndHour: "22",
  intervalEndMinute: "0",
  enabled: true
};

export const REMINDER_HISTORY_PAST_DAYS = 7;

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

export function formatTimeLabel(hour: number, minute: number): string {
  const safeHour = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(Number(minute) || 0)));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

export function formatReminderDays(days: number[]): string {
  const normalized = normalizeDays(days);
  if (normalized.length === 0) return "Every day";
  return formatDays(normalized);
}

export function formatDateInput(baseDate: Date): string {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + 1;
  const day = baseDate.getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getDeviceTodayLabel(): string {
  return getTodayLabelInTimeZone(getDeviceTimeZone());
}

export function ensureReminderTimeInputs(values: string[]): string[] {
  return Array.from({ length: 4 }, (_, index) => values[index] ?? "");
}

export function formatReminderCalendarMonth(cursor: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(cursor);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

export function getReminderCalendarMonthFromDateLabel(dateLabel: string): string {
  const parts = parseReminderDateParts(dateLabel);
  if (!parts) {
    const today = parseReminderDateParts(getDeviceTodayLabel());
    if (!today) return "";
    return `${String(today.year).padStart(4, "0")}-${String(today.month).padStart(2, "0")}`;
  }
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

export function shiftReminderCalendarMonth(cursor: string, monthDelta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(cursor);
  if (!match) return getReminderCalendarMonthFromDateLabel(getDeviceTodayLabel());
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + monthDelta, 1));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildReminderCalendarDays(monthCursor: string): ReminderCalendarDay[] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthCursor);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstWeekday));
  const todayLabel = getDeviceTodayLabel();
  const todayParts = parseReminderDateParts(todayLabel);
  const todayTs =
    todayParts == null ? null : Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 0, 0, 0, 0);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime() + index * 24 * 60 * 60 * 1000);
    const dateLabel = formatDateInput(date);
    const cellTs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
    return {
      dateLabel,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() + 1 === month,
      isToday: dateLabel === todayLabel,
      isPast: todayTs != null ? cellTs < todayTs : false
    };
  });
}

export function parseReminderTimeSlotInput(value: string): ReminderTimeSlot | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

export function formatReminderModeLabel(mode: ReminderMode): string {
  switch (mode) {
    case "interval":
      return "Interval";
    case "multi":
      return "Multiple times";
    case "once":
      return "One time";
    default:
      return "Recurring";
  }
}

export function formatReminderSchedule(item: ReminderItem): string {
  const timezone = item.timezone || getDeviceTimeZone();
  if (item.mode === "once") {
    const dateLabel = item.dateLabel ?? "No date";
    return `One time • ${dateLabel} • ${formatTimeLabel(item.hour, item.minute)} • ${timezone}`;
  }

  if (item.mode === "multi") {
    const slots = item.timeSlots.map((slot) => formatTimeLabel(slot.hour, slot.minute)).join(", ");
    return `${item.timeSlots.length} time${item.timeSlots.length === 1 ? "" : "s"} • ${slots} • ${formatReminderDays(item.days)} • ${timezone}`;
  }

  if (item.mode === "interval") {
    const start = formatTimeLabel(item.intervalStartHour ?? 8, item.intervalStartMinute ?? 0);
    const end = formatTimeLabel(item.intervalEndHour ?? 22, item.intervalEndMinute ?? 0);
    return `Every ${item.intervalMinutes ?? 60} min • ${start}-${end} • ${formatReminderDays(item.days)} • ${timezone}`;
  }

  return `${formatTimeLabel(item.hour, item.minute)} • ${formatReminderDays(item.days)} • ${timezone}`;
}

export function formatReminderOccurrenceLabel(timestamp: number, timezone: string): string {
  return `${formatTimestampInTimeZone(timestamp, timezone)} • ${timezone}`;
}

export function buildReminderHistoryOccurrences(
  reminder: ReminderItem,
  nowMs: number,
  pastDays: number,
  futureDays: number
): number[] {
  const candidates: number[] = [];
  const timezone = reminder.timezone || getDeviceTimeZone();

  if (reminder.mode === "once") {
    const parts = parseReminderDateParts(reminder.dateLabel ?? "");
    if (!parts) return [];
    const timestamp = zonedDateTimeToTimestamp(
      parts.year,
      parts.month,
      parts.day,
      reminder.hour,
      reminder.minute,
      timezone
    );
    const minTs = nowMs - pastDays * 24 * 60 * 60 * 1000;
    const maxTs = nowMs + futureDays * 24 * 60 * 60 * 1000;
    return timestamp >= minTs && timestamp <= maxTs ? [timestamp] : [];
  }

  const allowedDays = normalizeDays(reminder.days);
  const effectiveDays = allowedDays.length > 0 ? allowedDays : [0, 1, 2, 3, 4, 5, 6];
  const daySet = new Set<number>(effectiveDays);

  for (let dayOffset = -pastDays; dayOffset <= futureDays; dayOffset += 1) {
    const slot = getDayPartsInTimeZone(nowMs, dayOffset, timezone);
    if (!daySet.has(slot.weekday)) continue;

    if (reminder.mode === "time") {
      candidates.push(
        zonedDateTimeToTimestamp(
          slot.year,
          slot.month,
          slot.day,
          reminder.hour,
          reminder.minute,
          timezone
        )
      );
      continue;
    }

    if (reminder.mode === "multi") {
      for (const timeSlot of reminder.timeSlots) {
        candidates.push(
          zonedDateTimeToTimestamp(
            slot.year,
            slot.month,
            slot.day,
            timeSlot.hour,
            timeSlot.minute,
            timezone
          )
        );
      }
      continue;
    }

    const interval = Math.max(5, Math.floor(reminder.intervalMinutes ?? 0));
    const startHour = Math.min(23, Math.max(0, Math.floor(reminder.intervalStartHour ?? 8)));
    const startMinute = Math.min(59, Math.max(0, Math.floor(reminder.intervalStartMinute ?? 0)));
    const endHour = Math.min(23, Math.max(0, Math.floor(reminder.intervalEndHour ?? 22)));
    const endMinute = Math.min(59, Math.max(0, Math.floor(reminder.intervalEndMinute ?? 0)));
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) continue;

    for (let cursor = startTotal; cursor <= endTotal; cursor += interval) {
      const hour = Math.floor(cursor / 60);
      const minute = cursor % 60;
      candidates.push(
        zonedDateTimeToTimestamp(slot.year, slot.month, slot.day, hour, minute, timezone)
      );
    }
  }

  return Array.from(new Set(candidates)).sort((left, right) => left - right);
}

export function withAlpha(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) return hex;
  const parsed = Number.parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}
