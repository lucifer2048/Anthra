export type AccountWorkspaceKind = "guest" | "account";
export type AccountWorkspaceState = "active" | "locked" | "archived";
export type AccountImportState = "prepared" | "uploading" | "verifying" | "complete" | "failed";
export type AccountInstallKind = "new" | "legacy";
export type AccountOnboardingState = "pending" | "deferred" | "complete";

export type AccountInstallationState = {
  installKind: AccountInstallKind;
  onboardingState: AccountOnboardingState;
  linkedAuthUserId: string | null;
};

export type AccountBootstrapState = {
  activeWorkspaceId: string;
  workspaceKind: AccountWorkspaceKind;
  workspaceState: AccountWorkspaceState;
  authUserId: string | null;
  pendingImport: {
    importId: string;
    state: AccountImportState;
    error: string | null;
  } | null;
};

export type LegacyImportManifest = {
  format: "anthra-legacy-import";
  version: 2;
  createdAt: number;
  workspaceId: string;
  tables: Record<string, number>;
  exclusions: string[];
};

export type LegacyImportEntity = {
  entityId: string;
  entityType: string;
  localKey: string;
  payload: Record<string, unknown>;
  clientUpdatedAt: number;
};

export type LegacyImportProgress = {
  state: AccountImportState;
  uploaded: number;
  total: number;
};
