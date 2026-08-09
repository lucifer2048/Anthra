export type LegacyImportTableSpec = {
  name: string;
  keyColumns: readonly string[];
  where?: string;
};

/**
 * User-owned, recoverable records that can be copied to the private cloud
 * envelope. Vault secrets deliberately remain device-bound until Anthra has a
 * password-encrypted export format.
 */
export const LEGACY_IMPORT_TABLES: readonly LegacyImportTableSpec[] = [
  { name: "plans", keyColumns: ["id"] },
  { name: "plan_sections", keyColumns: ["id"] },
  { name: "exercises", keyColumns: ["id"] },
  { name: "workout_logs", keyColumns: ["id"] },
  { name: "workout_sessions", keyColumns: ["id"] },
  { name: "user_profile", keyColumns: ["id"] },
  { name: "user_settings", keyColumns: ["id"] },
  {
    name: "meta",
    keyColumns: ["key"],
    where: "key NOT IN ('active_workout_v1', 'plan_editor_draft_v1')"
  },
  { name: "reminders", keyColumns: ["id"] },
  { name: "reminder_completion_logs", keyColumns: ["id"] },
  { name: "alarms", keyColumns: ["id"] },
  { name: "alarm_logs", keyColumns: ["id"] },
  { name: "list_categories", keyColumns: ["id"] },
  { name: "list_items", keyColumns: ["id"] },
  { name: "tracker_buddy_trackers", keyColumns: ["id"] },
  { name: "tracker_buddy_tasks", keyColumns: ["id"] },
  { name: "tracker_buddy_task_versions", keyColumns: ["id"] },
  { name: "tracker_buddy_completions", keyColumns: ["id"] },
  { name: "activity_settings", keyColumns: ["id"] },
  { name: "activity_daily_summary", keyColumns: ["dateKey"] },
  { name: "activity_workouts", keyColumns: ["id"] },
  { name: "activity_sources", keyColumns: ["packageName"] },
  { name: "activity_sync_state", keyColumns: ["syncKey"] },
  { name: "step_sensor_checkpoints", keyColumns: ["dateKey", "timezone"] }
] as const;

export function legacyImportLocalKey(
  spec: LegacyImportTableSpec,
  row: Record<string, unknown>
): string {
  return JSON.stringify(spec.keyColumns.map((column) => row[column] ?? null));
}

export function legacyImportRecordTimestamp(row: Record<string, unknown>, fallback: number): number {
  const candidates = [
    row.updatedAt,
    row.completedAt,
    row.createdAt,
    row.lastModifiedTime,
    row.importedAt,
    row.startedAt,
    row.firedAt
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}
