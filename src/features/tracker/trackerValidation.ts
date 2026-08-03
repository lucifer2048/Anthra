import { normalizeDays } from "../../constants/schedule";
import { getDayPartsInTimeZone, zonedDateTimeToTimestamp } from "../../utils/timezone";
import { parseDateKey, shiftTrackerDate } from "./trackerStats";
import type { TrackerTaskInput } from "./trackerTypes";

export const MAX_ONE_TIME_TRACKER_DAYS = 365;

export function validateTrackerName(value: string): string | null {
  const name = value.trim();
  if (!name) return "Give this tracker a name.";
  if (name.length > 60) return "Tracker names can be up to 60 characters.";
  return null;
}

export function validateTrackerTask(input: TrackerTaskInput, now = Date.now()): string | null {
  const title = input.title.trim();
  if (!title) return "Give this task a name.";
  if (title.length > 120) return "Task names can be up to 120 characters.";
  if (input.recurrence === "weekdays" && normalizeDays(input.days).length === 0) {
    return "Choose at least one day of the week.";
  }
  if (input.recurrence === "once") {
    if (!input.onceDate) return "Choose the date for this one-time task.";
    try {
      parseDateKey(input.onceDate);
    } catch {
      return "Choose a valid date.";
    }
    const todayParts = getDayPartsInTimeZone(now, 0, input.timezone);
    const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
    if (input.onceDate < today) return "One-time tasks must be scheduled for today or a future date.";
  }
  if (!input.notificationEnabled) return null;
  if (!Number.isInteger(input.notificationHour) || input.notificationHour < 0 || input.notificationHour > 23) {
    return "Choose a valid notification hour.";
  }
  if (!Number.isInteger(input.notificationMinute) || input.notificationMinute < 0 || input.notificationMinute > 59) {
    return "Choose a valid notification minute.";
  }
  if (input.recurrence === "once" && input.onceDate) {
    const [year, month, day] = input.onceDate.split("-").map(Number);
    const timestamp = zonedDateTimeToTimestamp(
      year,
      month,
      day,
      input.notificationHour,
      input.notificationMinute,
      input.timezone
    );
    if (timestamp <= now + 60_000) return "Set the notification at least one minute in the future.";
    const todayParts = getDayPartsInTimeZone(now, 0, input.timezone);
    const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
    if (input.onceDate > shiftTrackerDate(today, MAX_ONE_TIME_TRACKER_DAYS)) {
      return "One-time notifications can be scheduled up to one year ahead.";
    }
  } else {
    const allowed = input.recurrence === "daily" ? [0, 1, 2, 3, 4, 5, 6] : normalizeDays(input.days);
    let hasFutureOccurrence = false;
    for (let offset = 0; offset <= 7; offset += 1) {
      const parts = getDayPartsInTimeZone(now, offset, input.timezone);
      if (!allowed.includes(parts.weekday)) continue;
      const timestamp = zonedDateTimeToTimestamp(
        parts.year,
        parts.month,
        parts.day,
        input.notificationHour,
        input.notificationMinute,
        input.timezone
      );
      if (timestamp > now + 60_000) {
        hasFutureOccurrence = true;
        break;
      }
    }
    if (!hasFutureOccurrence) return "Choose a notification time with a future occurrence.";
  }
  return null;
}
