export const TRACKER_TABLE_NAMES = [
  "tracker_buddy_trackers",
  "tracker_buddy_tasks",
  "tracker_buddy_task_versions",
  "tracker_buddy_completions"
] as const;

export const TRACKER_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS tracker_buddy_trackers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    createdDate TEXT NOT NULL,
    archivedAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tracker_buddy_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trackerId INTEGER NOT NULL,
    archivedAt INTEGER,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (trackerId) REFERENCES tracker_buddy_trackers(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS tracker_buddy_task_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    title TEXT NOT NULL,
    recurrence TEXT NOT NULL,
    daysCsv TEXT NOT NULL DEFAULT '',
    onceDate TEXT,
    notificationEnabled INTEGER NOT NULL DEFAULT 0,
    notificationHour INTEGER NOT NULL DEFAULT 9,
    notificationMinute INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL,
    validFrom TEXT NOT NULL,
    validTo TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (taskId) REFERENCES tracker_buddy_tasks(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tracker_versions_task_dates
    ON tracker_buddy_task_versions(taskId, validFrom, validTo);`,
  `CREATE TABLE IF NOT EXISTS tracker_buddy_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taskId INTEGER NOT NULL,
    versionId INTEGER NOT NULL,
    dateKey TEXT NOT NULL,
    completedAt INTEGER NOT NULL,
    UNIQUE(taskId, dateKey),
    FOREIGN KEY (taskId) REFERENCES tracker_buddy_tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (versionId) REFERENCES tracker_buddy_task_versions(id) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tracker_completions_date
    ON tracker_buddy_completions(dateKey);`
] as const;

