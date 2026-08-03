import type { ActivityDailySummary, ActivitySourceKind, StoredActivityWorkout } from "./activityTypes";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function dateKeyInTimeZone(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDateKey(dateKey: string, amount: number): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  if (!match) throw new Error(`Invalid activity date: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function recentDateKeys(todayKey: string, count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    shiftDateKey(todayKey, index - Math.max(0, count) + 1)
  );
}

export function selectAuthoritativeSteps(
  healthConnectSteps: number | null | undefined,
  phoneSteps: number | null | undefined
): { steps: number; source: ActivitySourceKind } {
  if (healthConnectSteps != null && Number.isFinite(healthConnectSteps)) {
    return {
      steps: Math.max(0, Math.floor(healthConnectSteps)),
      source: "health_connect"
    };
  }
  if (phoneSteps != null && Number.isFinite(phoneSteps)) {
    return {
      steps: Math.max(0, Math.floor(phoneSteps)),
      source: "phone_sensor"
    };
  }
  return { steps: 0, source: "none" };
}

export function qualifyingActivityDateKeys(
  summaries: ActivityDailySummary[],
  workouts: StoredActivityWorkout[],
  dailyGoal: number
): Set<string> {
  const goal = Math.max(1, Math.floor(dailyGoal));
  const dateKeys = new Set<string>();
  for (const summary of summaries) {
    if (summary.authoritativeSteps >= goal) dateKeys.add(summary.dateKey);
  }
  for (const workout of workouts) {
    if (workout.durationSeconds >= 10 * 60) dateKeys.add(workout.dateKey);
  }
  return dateKeys;
}

export function unionActivityDateKeys(...collections: Iterable<string>[]): Set<string> {
  const result = new Set<string>();
  for (const collection of collections) {
    for (const key of collection) result.add(key);
  }
  return result;
}

export function calculateActivityStreak(
  activeDateKeys: Iterable<string>,
  todayKey: string
): number {
  const active = new Set(activeDateKeys);
  let cursor = active.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

export function activeDaysThisWeek(activeDateKeys: Iterable<string>, todayKey: string): number {
  const active = new Set(activeDateKeys);
  return recentDateKeys(todayKey, 7).filter((key) => active.has(key)).length;
}
