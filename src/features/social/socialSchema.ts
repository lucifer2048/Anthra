export const SOCIAL_CACHE_TABLE_NAMES = ["social_snapshot_cache"] as const;

export const SOCIAL_CACHE_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS social_snapshot_cache (
    accountId TEXT PRIMARY KEY NOT NULL,
    dateKey TEXT NOT NULL,
    overviewJson TEXT NOT NULL,
    privacyJson TEXT NOT NULL,
    leaderboardJson TEXT NOT NULL,
    fetchedAt INTEGER NOT NULL
  );`
] as const;
