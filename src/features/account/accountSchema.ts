export const LEGACY_GUEST_WORKSPACE_ID = "guest:legacy";

export const ACCOUNT_TABLE_NAMES = [
  "account_workspaces",
  "account_runtime",
  "account_installation",
  "account_import_batches",
  "sync_identity",
  "sync_outbox",
  "sync_tombstones",
  "sync_checkpoints"
] as const;

/**
 * Additive-only account and sync infrastructure.
 *
 * Existing Anthra records deliberately remain untouched. The legacy database is
 * represented as a guest workspace until an authenticated import has been
 * uploaded and verified. This prevents a login from ever replacing local data
 * with an empty account database.
 */
export const ACCOUNT_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS account_workspaces (
    workspaceId TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('guest', 'account')),
    authUserId TEXT,
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'locked', 'archived')),
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    UNIQUE(authUserId)
  );`,
  `CREATE TABLE IF NOT EXISTS account_runtime (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    activeWorkspaceId TEXT NOT NULL,
    lastAuthUserId TEXT,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (activeWorkspaceId) REFERENCES account_workspaces(workspaceId)
  );`,
  `CREATE TABLE IF NOT EXISTS account_installation (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    installKind TEXT NOT NULL CHECK (installKind IN ('new', 'legacy')),
    onboardingState TEXT NOT NULL DEFAULT 'pending'
      CHECK (onboardingState IN ('pending', 'deferred', 'complete')),
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS account_import_batches (
    importId TEXT PRIMARY KEY NOT NULL,
    workspaceId TEXT NOT NULL,
    authUserId TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('prepared', 'uploading', 'verifying', 'complete', 'failed')),
    manifestJson TEXT NOT NULL,
    serverReceipt TEXT,
    error TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    completedAt INTEGER,
    UNIQUE(workspaceId, authUserId),
    FOREIGN KEY (workspaceId) REFERENCES account_workspaces(workspaceId)
  );`,
  `CREATE TABLE IF NOT EXISTS sync_identity (
    workspaceId TEXT NOT NULL,
    entityType TEXT NOT NULL,
    localKey TEXT NOT NULL,
    entityUuid TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    PRIMARY KEY (workspaceId, entityType, localKey),
    UNIQUE(workspaceId, entityUuid),
    FOREIGN KEY (workspaceId) REFERENCES account_workspaces(workspaceId)
  );`,
  `CREATE TABLE IF NOT EXISTS sync_outbox (
    operationUuid TEXT PRIMARY KEY NOT NULL,
    workspaceId TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityUuid TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
    payloadJson TEXT,
    baseRevision INTEGER,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'failed')),
    attemptCount INTEGER NOT NULL DEFAULT 0,
    nextAttemptAt INTEGER NOT NULL DEFAULT 0,
    lastError TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    FOREIGN KEY (workspaceId) REFERENCES account_workspaces(workspaceId)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
    ON sync_outbox(workspaceId, state, nextAttemptAt, createdAt);`,
  `CREATE TABLE IF NOT EXISTS sync_tombstones (
    workspaceId TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityUuid TEXT NOT NULL,
    deletedAt INTEGER NOT NULL,
    syncedAt INTEGER,
    PRIMARY KEY (workspaceId, entityType, entityUuid),
    FOREIGN KEY (workspaceId) REFERENCES account_workspaces(workspaceId)
  );`,
  `CREATE TABLE IF NOT EXISTS sync_checkpoints (
    workspaceId TEXT PRIMARY KEY NOT NULL,
    serverCursor TEXT,
    lastAttemptAt INTEGER,
    lastSuccessAt INTEGER,
    lastError TEXT,
    FOREIGN KEY (workspaceId) REFERENCES account_workspaces(workspaceId)
  );`,
  `INSERT OR IGNORE INTO account_workspaces (
    workspaceId, kind, authUserId, state, createdAt, updatedAt
  ) VALUES ('${LEGACY_GUEST_WORKSPACE_ID}', 'guest', NULL, 'active', 0, 0);`,
  `INSERT OR IGNORE INTO account_runtime (
    id, activeWorkspaceId, lastAuthUserId, updatedAt
  ) VALUES (1, '${LEGACY_GUEST_WORKSPACE_ID}', NULL, 0);`
] as const;
