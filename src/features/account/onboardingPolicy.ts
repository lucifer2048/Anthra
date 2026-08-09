import type { AccountInstallationState } from "./accountTypes";

export type AccountGateDecision = "app" | "loading" | "authenticate" | "migrate";

export function resolveAccountGateDecision(input: {
  localDataReady: boolean;
  onboardingLoading: boolean;
  installation: AccountInstallationState | null;
  hasSession: boolean;
  sessionUserId: string | null;
  legacyImportPrepared: boolean;
}): AccountGateDecision {
  if (!input.localDataReady) return "app";
  if (input.onboardingLoading || !input.installation) return "loading";

  const canUseLegacyOffline =
    input.installation.installKind === "legacy" &&
    !input.installation.linkedAuthUserId &&
    input.installation.onboardingState === "deferred";
  if (!input.hasSession && canUseLegacyOffline) return "app";
  const alreadyLinkedToSession =
    Boolean(input.sessionUserId) &&
    input.installation.linkedAuthUserId === input.sessionUserId;
  if (input.hasSession && alreadyLinkedToSession) return "app";
  if (input.hasSession && input.legacyImportPrepared) return "app";
  return input.hasSession ? "migrate" : "authenticate";
}
