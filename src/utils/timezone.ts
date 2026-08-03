export type ZonedDayParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
};

type ZonedDateTimeParts = ZonedDayParts & {
  hour: number;
  minute: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

function getZonedDateTimeParts(timestamp: number, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23"
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(timestamp))) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday: WEEKDAY_INDEX[values.weekday] ?? new Date(timestamp).getUTCDay()
  };
}

export function getDayPartsInTimeZone(
  baseTimestamp: number,
  dayOffset: number,
  timeZone: string
): ZonedDayParts {
  const base = getZonedDateTimeParts(baseTimestamp, timeZone);
  const shifted = new Date(Date.UTC(base.year, base.month - 1, base.day + dayOffset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay()
  };
}

export function zonedDateTimeToTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = targetAsUtc;

  // Resolve the IANA-zone offset at the target instant. Repeating handles DST boundaries.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getZonedDateTimeParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
      0
    );
    const correction = targetAsUtc - actualAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return candidate;
}

export function getTodayLabelInTimeZone(timeZone: string, timestamp = Date.now()): string {
  const parts = getDayPartsInTimeZone(timestamp, 0, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatTimestampInTimeZone(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}
