import assert from "node:assert/strict";
import test from "node:test";

import backupCompatibility from "../../../db/backupCompatibility.ts";
import activityDeduplication from "../activityDeduplication.ts";
import activitySchema from "../activitySchema.ts";
import activityStats from "../activityStats.ts";

const { normalizeLegacyBackupTables, isSupportedAnthraBackupVersion } =
  backupCompatibility;
const { deduplicateHealthWorkouts } = activityDeduplication;
const { ACTIVITY_MIGRATIONS, ACTIVITY_TABLE_NAMES } = activitySchema;
const {
  calculateActivityStreak,
  qualifyingActivityDateKeys,
  selectAuthoritativeSteps,
  unionActivityDateKeys
} = activityStats;

function summary(dateKey, steps) {
  return {
    dateKey,
    timezone: "Asia/Kolkata",
    phoneSteps: steps,
    healthConnectSteps: null,
    authoritativeSteps: steps,
    authoritativeSource: "phone_sensor",
    sourcePackages: ["anthra.phone_sensor"],
    updatedAt: 1
  };
}

function workout(overrides = {}) {
  return {
    id: 1,
    source: "health_connect",
    originPackage: "com.example.watch",
    externalId: "workout-1",
    clientRecordId: null,
    clientRecordVersion: 1,
    title: "Walk",
    exerciseType: 8,
    startTime: 1_000,
    endTime: 901_000,
    durationSeconds: 900,
    dateKey: "2026-07-24",
    lastModifiedTime: 10,
    ...overrides
  };
}

test("Health Connect totals take priority without adding phone steps", () => {
  assert.deepEqual(selectAuthoritativeSteps(8_000, 3_000), {
    steps: 8_000,
    source: "health_connect"
  });
  assert.deepEqual(selectAuthoritativeSteps(null, 3_000), {
    steps: 3_000,
    source: "phone_sensor"
  });
  assert.deepEqual(selectAuthoritativeSteps(null, null), {
    steps: 0,
    source: "none"
  });
});

test("activity dates are deduplicated across steps and workouts", () => {
  const dates = qualifyingActivityDateKeys(
    [summary("2026-07-24", 10_000)],
    [workout()],
    10_000
  );
  assert.deepEqual([...dates], ["2026-07-24"]);
});

test("workouts shorter than ten minutes do not qualify", () => {
  const dates = qualifyingActivityDateKeys(
    [],
    [workout({ durationSeconds: 599 })],
    10_000
  );
  assert.equal(dates.size, 0);
});

test("today does not prematurely break an existing streak", () => {
  const active = new Set(["2026-07-23", "2026-07-24", "2026-07-25"]);
  assert.equal(calculateActivityStreak(active, "2026-07-26"), 3);
  active.add("2026-07-26");
  assert.equal(calculateActivityStreak(active, "2026-07-26"), 4);
});

test("All Activity unions Anthra and activity dates once", () => {
  const combined = unionActivityDateKeys(
    new Set(["2026-07-24", "2026-07-25"]),
    new Set(["2026-07-25", "2026-07-26"])
  );
  assert.deepEqual([...combined].sort(), [
    "2026-07-24",
    "2026-07-25",
    "2026-07-26"
  ]);
});

test("duplicate external workouts keep the newest record", () => {
  const records = deduplicateHealthWorkouts([
    workout({ lastModifiedTime: 10, title: "Old" }),
    workout({ lastModifiedTime: 20, title: "Updated" })
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "Updated");
});

test("activity migrations are additive and repeat-safe", () => {
  for (const table of ACTIVITY_TABLE_NAMES) {
    assert.ok(
      ACTIVITY_MIGRATIONS.some((sql) =>
        sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)
      ),
      `missing idempotent migration for ${table}`
    );
  }
  assert.ok(
    ACTIVITY_MIGRATIONS.every(
      (sql) =>
        !sql.trim().startsWith("CREATE ") ||
        sql.includes("IF NOT EXISTS")
    )
  );
  assert.ok(
    ACTIVITY_MIGRATIONS.at(-1).includes("INSERT OR IGNORE")
  );
});

test("legacy backup versions remain supported", () => {
  assert.equal(isSupportedAnthraBackupVersion(1), true);
  assert.equal(isSupportedAnthraBackupVersion(2), true);
  assert.equal(isSupportedAnthraBackupVersion(3), true);
  assert.equal(isSupportedAnthraBackupVersion(4), true);
  assert.equal(isSupportedAnthraBackupVersion(5), true);
  assert.equal(isSupportedAnthraBackupVersion(6), true);
  assert.equal(isSupportedAnthraBackupVersion(7), false);

  const v1 = normalizeLegacyBackupTables(1, { plans: [] });
  assert.deepEqual(v1.alarms, []);
  assert.deepEqual(v1.alarm_logs, []);

  const v2 = normalizeLegacyBackupTables(2, { plans: [], alarms: [{ id: 1 }] });
  assert.deepEqual(v2.alarms, [{ id: 1 }]);
  assert.equal(v2.user_settings, undefined);

  const v3 = normalizeLegacyBackupTables(3, {
    user_settings: [{ id: 1, notificationsEnabled: 1 }]
  });
  assert.equal(v3.user_settings[0].reminderDelivery, "notification");
  assert.deepEqual(v3.activity_daily_summary, []);
  assert.deepEqual(v3.nutrition_entries, []);
});
