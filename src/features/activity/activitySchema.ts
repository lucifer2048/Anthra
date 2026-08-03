export const ACTIVITY_TABLE_NAMES = [
  "activity_settings",
  "activity_daily_summary",
  "activity_workouts",
  "activity_sources",
  "activity_sync_state",
  "step_sensor_checkpoints"
] as const;

export const ACTIVITY_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS activity_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dailyGoal INTEGER NOT NULL DEFAULT 10000,
    phoneTrackingEnabled INTEGER NOT NULL DEFAULT 0,
    shareScope TEXT NOT NULL DEFAULT 'activity',
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS activity_daily_summary (
    dateKey TEXT PRIMARY KEY NOT NULL,
    timezone TEXT NOT NULL,
    phoneSteps INTEGER,
    healthConnectSteps INTEGER,
    authoritativeSteps INTEGER NOT NULL DEFAULT 0,
    authoritativeSource TEXT NOT NULL DEFAULT 'none',
    sourcePackagesCsv TEXT NOT NULL DEFAULT '',
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_activity_daily_updated
    ON activity_daily_summary(updatedAt DESC);`,
  `CREATE TABLE IF NOT EXISTS activity_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    originPackage TEXT NOT NULL,
    externalId TEXT NOT NULL,
    clientRecordId TEXT,
    clientRecordVersion INTEGER NOT NULL DEFAULT 0,
    title TEXT,
    exerciseType INTEGER NOT NULL,
    startTime INTEGER NOT NULL,
    endTime INTEGER NOT NULL,
    durationSeconds INTEGER NOT NULL,
    dateKey TEXT NOT NULL,
    timezone TEXT NOT NULL,
    lastModifiedTime INTEGER NOT NULL,
    importedAt INTEGER NOT NULL,
    UNIQUE(originPackage, externalId)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_activity_workouts_date
    ON activity_workouts(dateKey, durationSeconds);`,
  `CREATE INDEX IF NOT EXISTS idx_activity_workouts_range
    ON activity_workouts(startTime, endTime);`,
  `CREATE TABLE IF NOT EXISTS activity_sources (
    packageName TEXT PRIMARY KEY NOT NULL,
    sourceType TEXT NOT NULL,
    displayName TEXT NOT NULL,
    lastSeenAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS activity_sync_state (
    syncKey TEXT PRIMARY KEY NOT NULL,
    lastAttemptAt INTEGER,
    lastSuccessAt INTEGER,
    error TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS step_sensor_checkpoints (
    dateKey TEXT NOT NULL,
    timezone TEXT NOT NULL,
    baselineRaw INTEGER NOT NULL,
    lastRaw INTEGER NOT NULL,
    steps INTEGER NOT NULL,
    counterReset INTEGER NOT NULL DEFAULT 0,
    rebootDetected INTEGER NOT NULL DEFAULT 0,
    updatedAt INTEGER NOT NULL,
    PRIMARY KEY(dateKey, timezone)
  );`,
  `INSERT OR IGNORE INTO activity_settings (
    id, dailyGoal, phoneTrackingEnabled, shareScope, updatedAt
  ) VALUES (1, 10000, 0, 'activity', 0);`
] as const;
