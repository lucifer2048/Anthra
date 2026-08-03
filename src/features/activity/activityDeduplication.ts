import type { HealthWorkout } from "./activityTypes";

export function deduplicateHealthWorkouts(records: HealthWorkout[]): HealthWorkout[] {
  const byOriginAndId = new Map<string, HealthWorkout>();
  for (const record of records) {
    const key = `${record.originPackage}\u0000${record.externalId}`;
    const existing = byOriginAndId.get(key);
    if (
      !existing ||
      record.lastModifiedTime > existing.lastModifiedTime ||
      (record.lastModifiedTime === existing.lastModifiedTime &&
        record.clientRecordVersion > existing.clientRecordVersion)
    ) {
      byOriginAndId.set(key, record);
    }
  }
  return [...byOriginAndId.values()];
}
