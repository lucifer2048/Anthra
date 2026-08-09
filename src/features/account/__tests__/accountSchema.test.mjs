import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import accountSchema from "../accountSchema.ts";

const {
  ACCOUNT_MIGRATIONS,
  ACCOUNT_TABLE_NAMES,
  LEGACY_GUEST_WORKSPACE_ID
} = accountSchema;

test("account migrations are additive and repeat-safe", () => {
  for (const table of ACCOUNT_TABLE_NAMES) {
    assert.ok(
      ACCOUNT_MIGRATIONS.some((sql) =>
        sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)
      ),
      `missing idempotent migration for ${table}`
    );
  }
  const combined = ACCOUNT_MIGRATIONS.join("\n").toUpperCase();
  assert.equal(combined.includes("DROP TABLE"), false);
  assert.equal(combined.includes("DELETE FROM"), false);
  assert.ok(combined.includes("INSERT OR IGNORE"));
});

test("legacy data starts in an explicit guest workspace", () => {
  assert.equal(LEGACY_GUEST_WORKSPACE_ID, "guest:legacy");
  const combined = ACCOUNT_MIGRATIONS.join("\n");
  assert.ok(combined.includes("kind IN ('guest', 'account')"));
  assert.ok(combined.includes(`'${LEGACY_GUEST_WORKSPACE_ID}', 'guest'`));
});

test("account schema records resumable imports and retryable sync operations", () => {
  const combined = ACCOUNT_MIGRATIONS.join("\n");
  assert.ok(combined.includes("'prepared', 'uploading', 'verifying', 'complete', 'failed'"));
  assert.ok(combined.includes("operationUuid TEXT PRIMARY KEY"));
  assert.ok(combined.includes("attemptCount INTEGER NOT NULL DEFAULT 0"));
  assert.ok(combined.includes("sync_tombstones"));
});

test("Supabase social migration enables RLS on every exposed user table", () => {
  const sql = readFileSync(
    new URL("../../../../supabase/migrations/202608080001_accounts_social.sql", import.meta.url),
    "utf8"
  );
  const tables = [
    "profiles",
    "privacy_settings",
    "friendships",
    "blocks",
    "daily_private_stats",
    "daily_social_stats",
    "legacy_import_batches",
    "synced_entities",
    "device_push_tokens"
  ];
  for (const table of tables) {
    assert.ok(
      sql.includes(`alter table public.${table} enable row level security`),
      `RLS missing for ${table}`
    );
  }
  assert.ok(sql.includes("stat_step_source <> 'manual'"));
  assert.ok(sql.includes("anthra_is_blocked"));
});
