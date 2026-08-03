import * as SQLite from "expo-sqlite";

import { getDeviceTimeZone } from "../../utils/timezone";
import { deduplicateHealthWorkouts } from "./activityDeduplication";
import { ACTIVITY_MIGRATIONS } from "./activitySchema";
import {
  dateKeyInTimeZone,
  selectAuthoritativeSteps
} from "./activityStats";
import type {
  ActivityDailySummary,
  ActivitySettings,
  ActivitySyncState,
  HealthDailyTotal,
  HealthWorkout,
  PhoneStepReading,
  PhoneStepDaySnapshot,
  StoredActivityWorkout
} from "./activityTypes";

let activityDb: ReturnType<typeof SQLite.openDatabaseSync> | null = null;
const PHONE_SOURCE_PACKAGE = "anthra.phone_sensor";
const SYNC_KEY = "foreground";

type SqlValue = string | number | null;
type SqlRow = Record<string, unknown>;

function getActivityDb(): ReturnType<typeof SQLite.openDatabaseSync> {
  if (!activityDb) activityDb = SQLite.openDatabaseSync("anthra.db");
  return activityDb;
}

async function all<T extends SqlRow>(sql: string, values: SqlValue[] = []): Promise<T[]> {
  return getActivityDb().getAllAsync<T>(sql, ...values);
}

async function run(sql: string, values: SqlValue[] = []) {
  return getActivityDb().runAsync(sql, ...values);
}

export async function initActivityDatabase(): Promise<void> {
  const db = getActivityDb();
  await db.execAsync("PRAGMA foreign_keys = ON;");
  for (const migration of ACTIVITY_MIGRATIONS) {
    await db.execAsync(migration);
  }
}

export async function getActivitySettings(): Promise<ActivitySettings> {
  const rows = await all<{
    dailyGoal: number;
    phoneTrackingEnabled: number;
    shareScope: string;
  }>("SELECT dailyGoal, phoneTrackingEnabled, shareScope FROM activity_settings WHERE id = 1;");
  const row = rows[0];
  return {
    dailyGoal: Math.max(1_000, Number(row?.dailyGoal ?? 10_000)),
    phoneTrackingEnabled: Number(row?.phoneTrackingEnabled ?? 0) === 1,
    shareScope: row?.shareScope === "all" ? "all" : "activity"
  };
}

export async function saveActivitySettings(settings: ActivitySettings): Promise<void> {
  await run(
    `INSERT INTO activity_settings (
       id, dailyGoal, phoneTrackingEnabled, shareScope, updatedAt
     ) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       dailyGoal = excluded.dailyGoal,
       phoneTrackingEnabled = excluded.phoneTrackingEnabled,
       shareScope = excluded.shareScope,
       updatedAt = excluded.updatedAt;`,
    [
      Math.min(100_000, Math.max(1_000, Math.floor(settings.dailyGoal))),
      settings.phoneTrackingEnabled ? 1 : 0,
      settings.shareScope,
      Date.now()
    ]
  );
}

async function readDailyRow(dateKey: string): Promise<ActivityDailySummary | null> {
  const rows = await all<{
    dateKey: string;
    timezone: string;
    phoneSteps: number | null;
    healthConnectSteps: number | null;
    authoritativeSteps: number;
    authoritativeSource: string;
    sourcePackagesCsv: string;
    updatedAt: number;
  }>("SELECT * FROM activity_daily_summary WHERE dateKey = ? LIMIT 1;", [dateKey]);
  const row = rows[0];
  if (!row) return null;
  return {
    dateKey: String(row.dateKey),
    timezone: String(row.timezone),
    phoneSteps: row.phoneSteps == null ? null : Number(row.phoneSteps),
    healthConnectSteps:
      row.healthConnectSteps == null ? null : Number(row.healthConnectSteps),
    authoritativeSteps: Math.max(0, Number(row.authoritativeSteps)),
    authoritativeSource:
      row.authoritativeSource === "health_connect"
        ? "health_connect"
        : row.authoritativeSource === "phone_sensor"
          ? "phone_sensor"
          : "none",
    sourcePackages: String(row.sourcePackagesCsv || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    updatedAt: Number(row.updatedAt)
  };
}

async function writeDailyRow(
  dateKey: string,
  timezone: string,
  phoneSteps: number | null,
  healthConnectSteps: number | null,
  sourcePackages: string[],
  updatedAt: number
): Promise<void> {
  const authoritative = selectAuthoritativeSteps(healthConnectSteps, phoneSteps);
  await run(
    `INSERT INTO activity_daily_summary (
       dateKey, timezone, phoneSteps, healthConnectSteps, authoritativeSteps,
       authoritativeSource, sourcePackagesCsv, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(dateKey) DO UPDATE SET
       timezone = excluded.timezone,
       phoneSteps = excluded.phoneSteps,
       healthConnectSteps = excluded.healthConnectSteps,
       authoritativeSteps = excluded.authoritativeSteps,
       authoritativeSource = excluded.authoritativeSource,
       sourcePackagesCsv = excluded.sourcePackagesCsv,
       updatedAt = excluded.updatedAt;`,
    [
      dateKey,
      timezone,
      phoneSteps,
      healthConnectSteps,
      authoritative.steps,
      authoritative.source,
      [...new Set(sourcePackages)].sort().join(","),
      updatedAt
    ]
  );
}

export async function savePhoneStepReading(reading: PhoneStepReading): Promise<void> {
  const now = Date.now();
  await getActivityDb().withTransactionAsync(async () => {
    const current = await readDailyRow(reading.dateKey);
    await writeDailyRow(
      reading.dateKey,
      reading.timezone,
      Math.max(0, Math.floor(reading.steps)),
      current?.healthConnectSteps ?? null,
      current?.sourcePackages ?? [PHONE_SOURCE_PACKAGE],
      now
    );
    await run(
      `INSERT INTO step_sensor_checkpoints (
         dateKey, timezone, baselineRaw, lastRaw, steps, counterReset, rebootDetected, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(dateKey, timezone) DO UPDATE SET
         baselineRaw = excluded.baselineRaw,
         lastRaw = excluded.lastRaw,
         steps = excluded.steps,
         counterReset = excluded.counterReset,
         rebootDetected = excluded.rebootDetected,
         updatedAt = excluded.updatedAt;`,
      [
        reading.dateKey,
        reading.timezone,
        reading.baselineRaw,
        reading.raw,
        reading.steps,
        reading.counterReset ? 1 : 0,
        reading.rebootDetected ? 1 : 0,
        now
      ]
    );
    await run(
      `INSERT INTO activity_sources (packageName, sourceType, displayName, lastSeenAt)
       VALUES (?, 'phone_sensor', 'This phone', ?)
       ON CONFLICT(packageName) DO UPDATE SET lastSeenAt = excluded.lastSeenAt;`,
      [PHONE_SOURCE_PACKAGE, now]
    );

    if (
      reading.rolledOverDayKey &&
      reading.rolledOverTimezone &&
      reading.rolledOverSteps != null
    ) {
      const rolled = await readDailyRow(reading.rolledOverDayKey);
      await writeDailyRow(
        reading.rolledOverDayKey,
        reading.rolledOverTimezone,
        reading.rolledOverSteps,
        rolled?.healthConnectSteps ?? null,
        rolled?.sourcePackages ?? [PHONE_SOURCE_PACKAGE],
        now
      );
    }
  });
}

export async function savePhoneStepDaySnapshots(
  snapshots: PhoneStepDaySnapshot[]
): Promise<void> {
  if (snapshots.length === 0) return;
  const now = Date.now();
  await getActivityDb().withTransactionAsync(async () => {
    for (const snapshot of snapshots) {
      const current = await readDailyRow(snapshot.dateKey);
      await writeDailyRow(
        snapshot.dateKey,
        snapshot.timezone,
        Math.max(0, Math.floor(snapshot.steps)),
        current?.healthConnectSteps ?? null,
        current?.sourcePackages ?? [PHONE_SOURCE_PACKAGE],
        now
      );
    }
  });
}

export async function saveHealthDailyTotals(totals: HealthDailyTotal[]): Promise<void> {
  const now = Date.now();
  await getActivityDb().withTransactionAsync(async () => {
    for (const total of totals) {
      const current = await readDailyRow(total.dateKey);
      await writeDailyRow(
        total.dateKey,
        total.timezone,
        current?.phoneSteps ?? null,
        Math.max(0, Math.floor(total.steps)),
        total.originPackages,
        now
      );
      for (const packageName of total.originPackages) {
        await upsertHealthSource(packageName, now);
      }
    }
  });
}

async function upsertHealthSource(packageName: string, lastSeenAt: number): Promise<void> {
  const displayName =
    packageName === "android"
      ? "Android phone steps"
      : packageName.split(".").filter(Boolean).at(-1) || "Health app";
  await run(
    `INSERT INTO activity_sources (packageName, sourceType, displayName, lastSeenAt)
     VALUES (?, 'health_connect', ?, ?)
     ON CONFLICT(packageName) DO UPDATE SET
       displayName = excluded.displayName,
       lastSeenAt = excluded.lastSeenAt;`,
    [packageName, displayName, lastSeenAt]
  );
}

export async function replaceHealthWorkoutsInRange(
  records: HealthWorkout[],
  startTime: number,
  endTime: number,
  timezone: string
): Promise<void> {
  const deduplicated = deduplicateHealthWorkouts(records);
  const now = Date.now();
  await getActivityDb().withTransactionAsync(async () => {
    // A foreground refresh is a complete snapshot for this bounded range. This
    // removes Health Connect records that the user deleted or revoked upstream.
    await run(
      `DELETE FROM activity_workouts
       WHERE source = 'health_connect' AND startTime >= ? AND startTime < ?;`,
      [startTime, endTime]
    );
    for (const record of deduplicated) {
      await run(
        `INSERT INTO activity_workouts (
           source, originPackage, externalId, clientRecordId, clientRecordVersion,
           title, exerciseType, startTime, endTime, durationSeconds, dateKey,
           timezone, lastModifiedTime, importedAt
         ) VALUES (
           'health_connect', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         )
         ON CONFLICT(originPackage, externalId) DO UPDATE SET
           clientRecordId = excluded.clientRecordId,
           clientRecordVersion = excluded.clientRecordVersion,
           title = excluded.title,
           exerciseType = excluded.exerciseType,
           startTime = excluded.startTime,
           endTime = excluded.endTime,
           durationSeconds = excluded.durationSeconds,
           dateKey = excluded.dateKey,
           timezone = excluded.timezone,
           lastModifiedTime = excluded.lastModifiedTime,
           importedAt = excluded.importedAt;`,
        [
          record.originPackage,
          record.externalId,
          record.clientRecordId,
          record.clientRecordVersion,
          record.title,
          record.exerciseType,
          record.startTime,
          record.endTime,
          Math.max(0, Math.floor((record.endTime - record.startTime) / 1000)),
          dateKeyInTimeZone(record.startTime, timezone),
          timezone,
          record.lastModifiedTime,
          now
        ]
      );
      await upsertHealthSource(record.originPackage, now);
    }
  });
}

export async function getActivityDailySummaries(
  startDateKey: string
): Promise<ActivityDailySummary[]> {
  const rows = await all<{ dateKey: string }>(
    `SELECT dateKey FROM activity_daily_summary
     WHERE dateKey >= ? ORDER BY dateKey ASC;`,
    [startDateKey]
  );
  const summaries: ActivityDailySummary[] = [];
  for (const row of rows) {
    const summary = await readDailyRow(String(row.dateKey));
    if (summary) summaries.push(summary);
  }
  return summaries;
}

export async function getStoredActivityWorkouts(
  startDateKey: string
): Promise<StoredActivityWorkout[]> {
  const rows = await all<{
    id: number;
    source: string;
    originPackage: string;
    externalId: string;
    clientRecordId: string | null;
    clientRecordVersion: number;
    title: string | null;
    exerciseType: number;
    startTime: number;
    endTime: number;
    durationSeconds: number;
    dateKey: string;
    lastModifiedTime: number;
  }>(
    `SELECT id, source, originPackage, externalId, clientRecordId, clientRecordVersion,
            title, exerciseType, startTime, endTime, durationSeconds, dateKey,
            lastModifiedTime
     FROM activity_workouts WHERE dateKey >= ? ORDER BY startTime DESC;`,
    [startDateKey]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    source: "health_connect",
    originPackage: String(row.originPackage),
    externalId: String(row.externalId),
    clientRecordId: row.clientRecordId == null ? null : String(row.clientRecordId),
    clientRecordVersion: Number(row.clientRecordVersion),
    title: row.title == null ? null : String(row.title),
    exerciseType: Number(row.exerciseType),
    startTime: Number(row.startTime),
    endTime: Number(row.endTime),
    durationSeconds: Number(row.durationSeconds),
    dateKey: String(row.dateKey),
    lastModifiedTime: Number(row.lastModifiedTime)
  }));
}

export async function getAnthraWorkoutDateKeys(
  startTime: number,
  timezone: string
): Promise<Set<string>> {
  const rows = await all<{ completedAt: number }>(
    "SELECT completedAt FROM workout_logs WHERE completedAt >= ? ORDER BY completedAt ASC;",
    [startTime]
  );
  return new Set(
    rows
      .map((row) => Number(row.completedAt))
      .filter(Number.isFinite)
      .map((timestamp) => dateKeyInTimeZone(timestamp, timezone))
  );
}

export async function recordActivitySyncAttempt(): Promise<void> {
  await run(
    `INSERT INTO activity_sync_state (syncKey, lastAttemptAt, lastSuccessAt, error)
     VALUES (?, ?, NULL, NULL)
     ON CONFLICT(syncKey) DO UPDATE SET lastAttemptAt = excluded.lastAttemptAt, error = NULL;`,
    [SYNC_KEY, Date.now()]
  );
}

export async function recordActivitySyncSuccess(): Promise<void> {
  const now = Date.now();
  await run(
    `INSERT INTO activity_sync_state (syncKey, lastAttemptAt, lastSuccessAt, error)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT(syncKey) DO UPDATE SET
       lastAttemptAt = excluded.lastAttemptAt,
       lastSuccessAt = excluded.lastSuccessAt,
       error = NULL;`,
    [SYNC_KEY, now, now]
  );
}

export async function recordActivitySyncFailure(error: string): Promise<void> {
  await run(
    `INSERT INTO activity_sync_state (syncKey, lastAttemptAt, lastSuccessAt, error)
     VALUES (?, ?, NULL, ?)
     ON CONFLICT(syncKey) DO UPDATE SET
       lastAttemptAt = excluded.lastAttemptAt,
       error = excluded.error;`,
    [SYNC_KEY, Date.now(), error.slice(0, 500)]
  );
}

export async function getActivitySyncState(): Promise<ActivitySyncState> {
  const rows = await all<{
    lastAttemptAt: number | null;
    lastSuccessAt: number | null;
    error: string | null;
  }>(
    "SELECT lastAttemptAt, lastSuccessAt, error FROM activity_sync_state WHERE syncKey = ?;",
    [SYNC_KEY]
  );
  const row = rows[0];
  return {
    lastAttemptAt: row?.lastAttemptAt == null ? null : Number(row.lastAttemptAt),
    lastSuccessAt: row?.lastSuccessAt == null ? null : Number(row.lastSuccessAt),
    error: row?.error == null ? null : String(row.error)
  };
}

export function currentActivityTimezone(): string {
  return getDeviceTimeZone();
}
