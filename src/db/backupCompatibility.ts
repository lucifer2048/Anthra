export type SupportedAnthraBackupVersion = 1 | 2 | 3 | 4;

export function isSupportedAnthraBackupVersion(
  value: unknown
): value is SupportedAnthraBackupVersion {
  return value === 1 || value === 2 || value === 3 || value === 4;
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
      : {})
  };
}
