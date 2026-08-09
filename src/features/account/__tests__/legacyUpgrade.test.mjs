import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import accountSchema from "../accountSchema.ts";
import importCatalog from "../legacyImportCatalog.ts";

const { ACCOUNT_MIGRATIONS, ACCOUNT_TABLE_NAMES } = accountSchema;
const { LEGACY_IMPORT_TABLES, legacyImportLocalKey } = importCatalog;
const DatabaseSync = await import("node:sqlite")
  .then((module) => module.DatabaseSync)
  .catch(() => null);

function representativeV16Database() {
  if (!DatabaseSync) throw new Error("node:sqlite is unavailable");
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE plans (id INTEGER PRIMARY KEY, name TEXT NOT NULL, loops INTEGER NOT NULL, workoutDays TEXT NOT NULL, createdAt INTEGER NOT NULL);
    CREATE TABLE reminders (id INTEGER PRIMARY KEY, title TEXT NOT NULL, note TEXT NOT NULL, enabled INTEGER NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE tracker_buddy_trackers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, createdDate TEXT NOT NULL, archivedAt INTEGER, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE TABLE activity_daily_summary (dateKey TEXT PRIMARY KEY, timezone TEXT NOT NULL, phoneSteps INTEGER, healthConnectSteps INTEGER, authoritativeSteps INTEGER NOT NULL, authoritativeSource TEXT NOT NULL, sourcePackagesCsv TEXT NOT NULL, updatedAt INTEGER NOT NULL);
    INSERT INTO plans VALUES (7, 'Legacy strength', 3, '1,3,5', 1700000000000);
    INSERT INTO reminders VALUES (11, 'Creatine', '5g after training', 1, 1700000001000, 1700000002000);
    INSERT INTO tracker_buddy_trackers VALUES (13, 'Supplements', '2026-07-01', NULL, 1700000003000, 1700000004000);
    INSERT INTO activity_daily_summary VALUES ('2026-08-07', 'Asia/Kolkata', 8432, NULL, 8432, 'phone_sensor', 'anthra.phone_sensor', 1700000005000);
  `);
  return db;
}

test("a representative v16 database retains every legacy row after account migrations", {
  skip: !DatabaseSync && "node:sqlite requires Node 22 or newer"
}, () => {
  const db = representativeV16Database();
  const before = {
    plans: db.prepare("SELECT * FROM plans").all(),
    reminders: db.prepare("SELECT * FROM reminders").all(),
    trackers: db.prepare("SELECT * FROM tracker_buddy_trackers").all(),
    activity: db.prepare("SELECT * FROM activity_daily_summary").all()
  };

  db.exec("BEGIN");
  for (const migration of ACCOUNT_MIGRATIONS) db.exec(migration);
  db.exec("COMMIT");
  for (const migration of ACCOUNT_MIGRATIONS) db.exec(migration);

  assert.deepEqual(db.prepare("SELECT * FROM plans").all(), before.plans);
  assert.deepEqual(db.prepare("SELECT * FROM reminders").all(), before.reminders);
  assert.deepEqual(db.prepare("SELECT * FROM tracker_buddy_trackers").all(), before.trackers);
  assert.deepEqual(db.prepare("SELECT * FROM activity_daily_summary").all(), before.activity);
  for (const table of ACCOUNT_TABLE_NAMES) {
    assert.equal(
      db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = ?").get(table).total,
      1
    );
  }
  assert.equal(
    db.prepare("SELECT activeWorkspaceId FROM account_runtime WHERE id = 1").get().activeWorkspaceId,
    "guest:legacy"
  );
});

test("cloud import catalog covers recoverable activity records and uses stable primary keys", () => {
  const daily = LEGACY_IMPORT_TABLES.find((table) => table.name === "activity_daily_summary");
  const checkpoints = LEGACY_IMPORT_TABLES.find((table) => table.name === "step_sensor_checkpoints");
  assert.ok(daily);
  assert.ok(checkpoints);
  assert.equal(legacyImportLocalKey(daily, { dateKey: "2026-08-08", updatedAt: 1 }), '["2026-08-08"]');
  assert.equal(
    legacyImportLocalKey(checkpoints, { dateKey: "2026-08-08", timezone: "Asia/Kolkata", steps: 42 }),
    '["2026-08-08","Asia/Kolkata"]'
  );
});

test("packaged Android routes include an exact OAuth callback without weakening plan imports", () => {
  const manifest = readFileSync(
    new URL("../../../../android/app/src/main/AndroidManifest.xml", import.meta.url),
    "utf8"
  );
  assert.match(manifest, /android:scheme="anthra" android:host="auth" android:pathPrefix="\/callback"/);
  assert.match(manifest, /android:scheme="anthra" android:host="plan" android:pathPrefix="\/import"/);
});

test("production release cannot silently reuse debug signing", () => {
  const gradle = readFileSync(
    new URL("../../../../android/app/build.gradle", import.meta.url),
    "utf8"
  );
  const releaseBlock = gradle.slice(gradle.indexOf("release {", gradle.indexOf("buildTypes")), gradle.indexOf("internal {"));
  assert.equal(releaseBlock.includes("signingConfigs.debug"), false);
  assert.match(gradle, /Use :app:assembleInternal for a debug-signed test APK/);
});

test("server verification binds imported entities to count and checksum", () => {
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/202608080002_verified_legacy_import.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /legacy_import_id uuid/);
  assert.match(sql, /actual_record_count <> expected_record_count/);
  assert.match(sql, /actual_checksum <> expected_checksum/);
  assert.match(sql, /state = 'complete'/);
});

test("profile photos use a private size-limited bucket with owner-only policies", () => {
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/202608080003_private_avatars.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /'anthra-profile-avatars',\s*'anthra-profile-avatars',\s*false/);
  assert.match(sql, /1048576/);
  assert.match(sql, /on conflict \(id\) do update/i);
  assert.equal(sql.toLowerCase().includes("drop policy"), false);
  assert.match(sql, /anthra_avatar_owner_select/);
  assert.match(sql, /anthra_avatar_owner_insert/);
  assert.match(sql, /anthra_avatar_owner_update/);
  assert.match(sql, /storage\.foldername\(name\).*auth\.uid\(\)/s);

  const hardeningSql = readFileSync(
    new URL("../../../../supabase/migrations/202608080005_avatar_storage_hardening.sql", import.meta.url),
    "utf8"
  );
  assert.match(hardeningSql, /1048576/);
  assert.match(hardeningSql, /array\['image\/jpeg'\]/);
  assert.match(hardeningSql, /on conflict \(id\) do update/i);
  assert.equal(/\b(drop|delete|truncate)\b/i.test(hardeningSql), false);
});

test("social RPCs enforce authenticated friendship actions without exposing email", () => {
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/202608080004_friends_leaderboards.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /search_anthra_profiles/);
  assert.match(sql, /length\(trim\(search_text\)\) >= 2/);
  assert.equal(/\bemail\b/i.test(sql), false);
  assert.match(sql, /cancel_friend_request/);
  assert.match(sql, /requested_by = auth\.uid\(\)/);
  assert.match(sql, /remove_friend/);
  assert.match(sql, /auth\.uid\(\) in \(user_low_id, user_high_id\)/);
  assert.match(sql, /anthra_friend_avatar_select/);
  assert.match(sql, /anthra_are_friends/);
  assert.match(sql, /anthra_is_blocked/);
  assert.equal(/\b(drop|truncate)\b/i.test(sql), false);
});

test("Android avatar selection avoids the crash-prone native crop activity", () => {
  const source = readFileSync(
    new URL("../profileService.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /allowsEditing: false/);
  assert.match(source, /Platform\.OS === "ios"/);
  assert.match(source, /PROFILE_AVATAR_DIMENSION = 512/);
  assert.match(source, /PROFILE_AVATAR_MAX_BYTES = 1024 \* 1024/);
  assert.match(source, /avatar\.jpg/);

  const avatarSource = readFileSync(new URL("../ProfileAvatar.tsx", import.meta.url), "utf8");
  assert.match(avatarSource, /parsed\.protocol === "https:"/);
  assert.match(avatarSource, /onError=\{\(\) => setFailedUri\(safeUri\)\}/);
  assert.match(avatarSource, /UserRound/);
  assert.match(avatarSource, /borderRadius: size \/ 2/);
  assert.match(avatarSource, /overflow: "hidden"/);
});
