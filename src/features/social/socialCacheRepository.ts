import * as SQLite from "expo-sqlite";

import { SOCIAL_CACHE_MIGRATIONS } from "./socialSchema";
import type { SocialSnapshot } from "./socialTypes";

let socialDb: ReturnType<typeof SQLite.openDatabaseSync> | null = null;

function db(): ReturnType<typeof SQLite.openDatabaseSync> {
  if (!socialDb) socialDb = SQLite.openDatabaseSync("anthra.db");
  return socialDb;
}

export async function initSocialCacheDatabase(): Promise<void> {
  for (const migration of SOCIAL_CACHE_MIGRATIONS) await db().execAsync(migration);
}

export async function loadSocialSnapshotCache(accountId: string): Promise<SocialSnapshot | null> {
  await initSocialCacheDatabase();
  const row = await db().getFirstAsync<Record<string, unknown>>(
    `SELECT accountId, dateKey, overviewJson, privacyJson, leaderboardJson, fetchedAt
     FROM social_snapshot_cache WHERE accountId = ? LIMIT 1;`,
    accountId
  );
  if (!row) return null;
  try {
    const overview = JSON.parse(String(row.overviewJson));
    const privacy = JSON.parse(String(row.privacyJson));
    const leaderboard = JSON.parse(String(row.leaderboardJson));
    if (!overview || typeof overview !== "object" || Array.isArray(overview)) return null;
    if (!privacy || typeof privacy !== "object" || Array.isArray(privacy)) return null;
    if (!Array.isArray(leaderboard)) return null;
    if (!Array.isArray(overview.friends) || !Array.isArray(overview.incoming) || !Array.isArray(overview.outgoing)) return null;
    return {
      accountId: String(row.accountId),
      dateKey: String(row.dateKey),
      overview,
      privacy,
      leaderboard,
      fetchedAt: Math.max(0, Number(row.fetchedAt) || 0)
    } as SocialSnapshot;
  } catch {
    await deleteSocialSnapshotCache(accountId);
    return null;
  }
}

export async function saveSocialSnapshotCache(snapshot: SocialSnapshot): Promise<void> {
  await initSocialCacheDatabase();
  await db().runAsync(
    `INSERT INTO social_snapshot_cache (
       accountId, dateKey, overviewJson, privacyJson, leaderboardJson, fetchedAt
     ) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(accountId) DO UPDATE SET
       dateKey = excluded.dateKey,
       overviewJson = excluded.overviewJson,
       privacyJson = excluded.privacyJson,
       leaderboardJson = excluded.leaderboardJson,
       fetchedAt = excluded.fetchedAt;`,
    snapshot.accountId,
    snapshot.dateKey,
    JSON.stringify(snapshot.overview),
    JSON.stringify(snapshot.privacy),
    JSON.stringify(snapshot.leaderboard),
    snapshot.fetchedAt
  );
}

export async function deleteSocialSnapshotCache(accountId: string): Promise<void> {
  await initSocialCacheDatabase();
  await db().runAsync("DELETE FROM social_snapshot_cache WHERE accountId = ?;", accountId);
}
