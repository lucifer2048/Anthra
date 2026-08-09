export type SupportedAnthraBackupVersion = 1 | 2 | 3 | 4 | 5 | 6;

export function isSupportedAnthraBackupVersion(
  value: unknown
): value is SupportedAnthraBackupVersion {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

export function normalizeLegacyBackupTables(
  version: SupportedAnthraBackupVersion,
  tables: Record<string, unknown>
): Record<string, unknown> {
  const settings = Array.isArray(tables.user_settings)
    ? tables.user_settings.map((row) =>
        row && typeof row === "object"
          ? { reminderDelivery: "notification", ...row }
          : row
      )
    : tables.user_settings;
  return {
    ...tables,
    ...(version < 4 ? { user_settings: settings } : {}),
    ...(version === 1
      ? {
          alarms: Array.isArray(tables.alarms) ? tables.alarms : [],
          alarm_logs: Array.isArray(tables.alarm_logs) ? tables.alarm_logs : []
        }
      : {}),
    ...(version < 3
      ? {
          tracker_buddy_trackers: [],
          tracker_buddy_tasks: [],
          tracker_buddy_task_versions: [],
          tracker_buddy_completions: []
        }
      : {}),
    ...(version < 5
      ? {
          activity_settings: [],
          activity_daily_summary: [],
          activity_workouts: [],
          activity_sources: [],
          activity_sync_state: [],
          step_sensor_checkpoints: []
        }
      : {})
    ,...(version < 6
      ? {
          nutrition_goals: [],
          nutrition_entries: [],
          nutrition_entry_items: [],
          nutrition_custom_foods: [],
          nutrition_sync_queue: []
        }
      : {})
  };
}
