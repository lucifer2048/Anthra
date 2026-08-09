import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

import { ACCOUNT_MIGRATIONS, LEGACY_GUEST_WORKSPACE_ID } from "./accountSchema";
import {
  LEGACY_IMPORT_TABLES,
  legacyImportLocalKey,
  legacyImportRecordTimestamp
} from "./legacyImportCatalog";
import type {
  AccountBootstrapState,
  AccountInstallationState,
  AccountImportState,
  LegacyImportEntity,
  LegacyImportManifest
} from "./accountTypes";

let accountDb: ReturnType<typeof SQLite.openDatabaseSync> | null = null;

function getDb(): ReturnType<typeof SQLite.openDatabaseSync> {
  if (!accountDb) accountDb = SQLite.openDatabaseSync("anthra.db");
  return accountDb;
}

export async function initAccountDatabase(): Promise<void> {
  const db = getDb();
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.withTransactionAsync(async () => {
    for (const migration of ACCOUNT_MIGRATIONS) {
      await db.execAsync(migration);
    }
  });
  await initializeInstallationState();
}

async function meaningfulLegacyRecordCount(): Promise<number> {
  const tables = [
    "plans",
    "workout_logs",
    "workout_sessions",
    "reminders",
    "reminder_completion_logs",
    "alarms",
    "alarm_logs",
    "list_categories",
    "list_items",
    "tracker_buddy_trackers",
    "tracker_buddy_completions",
    "activity_daily_summary",
    "activity_workouts",
    "vault_entries",
    "meta"
  ];
  let total = 0;
  for (const table of tables) total += await countIfPresent(table);
  if (await tableExists("user_profile")) {
    total += Number(
      (
        await getDb().getFirstAsync<{ total: number }>(
          `SELECT COUNT(*) AS total FROM user_profile
           WHERE heightCm IS NOT NULL OR weightKg IS NOT NULL OR TRIM(goal) <> '';`
        )
      )?.total ?? 0
    );
  }
  return total;
}

async function initializeInstallationState(): Promise<void> {
  const existing = await getDb().getFirstAsync<{ id: number }>(
    "SELECT id FROM account_installation WHERE id = 1;"
  );
  if (existing) return;
  const installKind = (await meaningfulLegacyRecordCount()) > 0 ? "legacy" : "new";
  const now = Date.now();
  await getDb().runAsync(
    `INSERT OR IGNORE INTO account_installation (
       id, installKind, onboardingState, createdAt, updatedAt
     ) VALUES (1, ?, 'pending', ?, ?);`,
    installKind,
    now,
    now
  );
}

export async function getAccountInstallationState(): Promise<AccountInstallationState> {
  await initAccountDatabase();
  const row = await getDb().getFirstAsync<{
    installKind: string;
    onboardingState: string;
    linkedAuthUserId: string | null;
  }>(
    `SELECT i.installKind, i.onboardingState, r.lastAuthUserId AS linkedAuthUserId
     FROM account_installation i
     JOIN account_runtime r ON r.id = 1
     WHERE i.id = 1;`
  );
  if (!row) throw new Error("Anthra onboarding state could not be initialized.");
  return {
    installKind: row.installKind === "legacy" ? "legacy" : "new",
    onboardingState:
      row.onboardingState === "complete"
        ? "complete"
        : row.onboardingState === "deferred"
          ? "deferred"
          : "pending",
    linkedAuthUserId: row.linkedAuthUserId
  };
}

export async function setAccountOnboardingState(
  onboardingState: AccountInstallationState["onboardingState"]
): Promise<void> {
  await initAccountDatabase();
  await getDb().runAsync(
    "UPDATE account_installation SET onboardingState = ?, updatedAt = ? WHERE id = 1;",
    onboardingState,
    Date.now()
  );
}

export async function getAccountBootstrapState(): Promise<AccountBootstrapState> {
  await initAccountDatabase();
  const runtime = await getDb().getFirstAsync<{
    activeWorkspaceId: string;
    kind: string;
    state: string;
    authUserId: string | null;
  }>(
    `SELECT r.activeWorkspaceId, w.kind, w.state, w.authUserId
     FROM account_runtime r
     JOIN account_workspaces w ON w.workspaceId = r.activeWorkspaceId
     WHERE r.id = 1;`
  );

  if (!runtime) throw new Error("Anthra account workspace could not be initialized.");
  const pending = await getDb().getFirstAsync<{
    importId: string;
    state: AccountImportState;
    error: string | null;
  }>(
    `SELECT importId, state, error
     FROM account_import_batches
     WHERE workspaceId = ? AND state <> 'complete'
     ORDER BY createdAt DESC
     LIMIT 1;`,
    runtime.activeWorkspaceId
  );

  return {
    activeWorkspaceId: runtime.activeWorkspaceId,
    workspaceKind: runtime.kind === "account" ? "account" : "guest",
    workspaceState:
      runtime.state === "locked" || runtime.state === "archived" ? runtime.state : "active",
    authUserId: runtime.authUserId,
    pendingImport: pending
      ? { importId: pending.importId, state: pending.state, error: pending.error }
      : null
  };
}

async function tableExists(table: string): Promise<boolean> {
  const exists = await getDb().getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;",
    table
  );
  return Boolean(exists);
}

async function readImportRows(table: string, where?: string): Promise<Record<string, unknown>[]> {
  if (!(await tableExists(table))) return [];
  return getDb().getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ${table}${where ? ` WHERE ${where}` : ""};`
  );
}

async function countIfPresent(table: string, where?: string): Promise<number> {
  if (!(await tableExists(table))) return 0;
  const result = await getDb().getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${table}${where ? ` WHERE ${where}` : ""};`
  );
  return Math.max(0, Number(result?.total ?? 0));
}

async function assertWorkspaceCanBeClaimed(authUserId: string): Promise<void> {
  const claimed = await getDb().getFirstAsync<{ authUserId: string }>(
    `SELECT authUserId
     FROM account_workspaces
     WHERE kind = 'account' AND authUserId IS NOT NULL
     LIMIT 1;`
  );
  if (claimed?.authUserId && claimed.authUserId !== authUserId) {
    throw new Error(
      "This device's existing Anthra data is already linked to another account. Sign in with that account to avoid mixing private data."
    );
  }
}

export async function prepareLegacyImport(authUserId: string): Promise<{
  importId: string;
  manifest: LegacyImportManifest;
  state: AccountImportState;
}> {
  const normalizedUserId = authUserId.trim();
  if (!normalizedUserId) throw new Error("A valid authenticated user is required.");
  await initAccountDatabase();

  await assertWorkspaceCanBeClaimed(normalizedUserId);

  const existing = await getDb().getFirstAsync<{
    importId: string;
    manifestJson: string;
    state: AccountImportState;
  }>(
    `SELECT importId, manifestJson, state
     FROM account_import_batches
     WHERE workspaceId = ? AND authUserId = ?
     LIMIT 1;`,
    LEGACY_GUEST_WORKSPACE_ID,
    normalizedUserId
  );
  if (existing?.state === "complete") {
    return {
      importId: existing.importId,
      manifest: JSON.parse(existing.manifestJson) as LegacyImportManifest,
      state: existing.state
    };
  }

  const tables: Record<string, number> = {};
  for (const table of LEGACY_IMPORT_TABLES) {
    tables[table.name] = await countIfPresent(table.name, table.where);
  }

  const now = Date.now();
  const importId = Crypto.randomUUID();
  const manifest: LegacyImportManifest = {
    format: "anthra-legacy-import",
    version: 2,
    createdAt: now,
    workspaceId: LEGACY_GUEST_WORKSPACE_ID,
    tables,
    exclusions: ["vault_entries", "vault_settings", "secure-store secrets"]
  };
  if (existing) {
    await getDb().runAsync(
      `UPDATE account_import_batches
       SET state = 'prepared', manifestJson = ?, error = NULL, updatedAt = ?
       WHERE importId = ?;`,
      JSON.stringify(manifest),
      now,
      existing.importId
    );
    return { importId: existing.importId, manifest, state: "prepared" };
  }

  await getDb().runAsync(
    `INSERT INTO account_import_batches (
       importId, workspaceId, authUserId, state, manifestJson, createdAt, updatedAt
     ) VALUES (?, ?, ?, 'prepared', ?, ?, ?);`,
    importId,
    LEGACY_GUEST_WORKSPACE_ID,
    normalizedUserId,
    JSON.stringify(manifest),
    now,
    now
  );
  return { importId, manifest, state: "prepared" };
}

export async function materializeLegacyImport(
  authUserId: string,
  prepared?: { importId: string; manifest: LegacyImportManifest; state: AccountImportState }
): Promise<{
  importId: string;
  manifest: LegacyImportManifest;
  state: AccountImportState;
  entities: LegacyImportEntity[];
}> {
  const batch = prepared ?? (await prepareLegacyImport(authUserId));
  const entities: LegacyImportEntity[] = [];
  const db = getDb();

  for (const spec of LEGACY_IMPORT_TABLES) {
    const rows = await readImportRows(spec.name, spec.where);
    for (const row of rows) {
      const localKey = legacyImportLocalKey(spec, row);
      let identity = await db.getFirstAsync<{ entityUuid: string }>(
        `SELECT entityUuid FROM sync_identity
         WHERE workspaceId = ? AND entityType = ? AND localKey = ?;`,
        LEGACY_GUEST_WORKSPACE_ID,
        spec.name,
        localKey
      );
      if (!identity) {
        const entityUuid = Crypto.randomUUID();
        await db.runAsync(
          `INSERT OR IGNORE INTO sync_identity (
             workspaceId, entityType, localKey, entityUuid, createdAt
           ) VALUES (?, ?, ?, ?, ?);`,
          LEGACY_GUEST_WORKSPACE_ID,
          spec.name,
          localKey,
          entityUuid,
          Date.now()
        );
        identity = await db.getFirstAsync<{ entityUuid: string }>(
          `SELECT entityUuid FROM sync_identity
           WHERE workspaceId = ? AND entityType = ? AND localKey = ?;`,
          LEGACY_GUEST_WORKSPACE_ID,
          spec.name,
          localKey
        );
      }
      if (!identity) throw new Error(`Could not assign a sync identity for ${spec.name}.`);
      entities.push({
        entityId: identity.entityUuid,
        entityType: spec.name,
        localKey,
        payload: row,
        clientUpdatedAt: legacyImportRecordTimestamp(row, batch.manifest.createdAt)
      });
    }
  }

  return { ...batch, entities };
}

export async function activateAccountWorkspace(authUserId: string): Promise<void> {
  const normalizedUserId = authUserId.trim();
  if (!normalizedUserId) throw new Error("A valid authenticated user is required.");
  await initAccountDatabase();
  await assertWorkspaceCanBeClaimed(normalizedUserId);
  const now = Date.now();
  const workspaceId = `account:${normalizedUserId}`;
  await getDb().withTransactionAsync(async () => {
    await getDb().runAsync(
      `INSERT INTO account_workspaces (
         workspaceId, kind, authUserId, state, createdAt, updatedAt
       ) VALUES (?, 'account', ?, 'active', ?, ?)
       ON CONFLICT(workspaceId) DO UPDATE SET
         authUserId = excluded.authUserId,
         state = 'active',
         updatedAt = excluded.updatedAt;`,
      workspaceId,
      normalizedUserId,
      now,
      now
    );
    await getDb().runAsync(
      `UPDATE account_runtime
       SET activeWorkspaceId = ?, lastAuthUserId = ?, updatedAt = ?
       WHERE id = 1;`,
      workspaceId,
      normalizedUserId,
      now
    );
    await getDb().runAsync(
      "UPDATE account_installation SET onboardingState = 'complete', updatedAt = ? WHERE id = 1;",
      now
    );
  });
}

export async function updateLegacyImportState(
  importId: string,
  state: AccountImportState,
  options: { serverReceipt?: string | null; error?: string | null } = {}
): Promise<void> {
  const now = Date.now();
  await getDb().runAsync(
    `UPDATE account_import_batches
     SET state = ?, serverReceipt = COALESCE(?, serverReceipt), error = ?, updatedAt = ?,
         completedAt = CASE WHEN ? = 'complete' THEN ? ELSE completedAt END
     WHERE importId = ?;`,
    state,
    options.serverReceipt ?? null,
    options.error ?? null,
    now,
    state,
    now,
    importId
  );
}
