import { useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Cloud, ShieldCheck } from "lucide-react-native";

import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import { Button, Card, KeyboardAwareScrollView, StatusBanner } from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { AuthForm } from "./AuthForm";
import { useAccount } from "./AccountProvider";
import { resolveAccountGateDecision } from "./onboardingPolicy";

export function AccountOnboardingGate({ children }: { children: ReactNode }) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const account = useAccount();
  const [busy, setBusy] = useState(false);

  const decision = resolveAccountGateDecision({
    localDataReady: account.localDataReady,
    onboardingLoading: account.onboardingLoading,
    installation: account.installation,
    hasSession: Boolean(account.session),
    sessionUserId: account.user?.id ?? null,
    legacyImportPrepared: account.legacyImportPrepared
  });

  if (decision === "app") return children;

  if (decision === "loading" || !account.installation) {
    return (
      <ScreenLayout {...backgrounds.brandWash} safeAreaEdges={["top", "bottom", "left", "right"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.md }}>
          <ActivityIndicator color={theme.colors.brand} size="large" />
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>Checking your Anthra data…</Text>
        </View>
      </ScreenLayout>
    );
  }

  const installation = account.installation;
  const canContinueOffline =
    installation.installKind === "legacy" && !installation.linkedAuthUserId;

  const migrationFailed =
    decision === "migrate" && account.legacyImportProgress?.state === "failed";
  const migrationRunning = decision === "migrate" && !migrationFailed;

  return (
    <ScreenLayout {...backgrounds.brandWash} safeAreaEdges={["top", "bottom", "left", "right"]}>
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        extraKeyboardSpace={theme.spacing["3xl"]}
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          maxWidth: 440,
          alignSelf: "center",
          justifyContent: "center",
          paddingHorizontal: theme.layout.screenPadding,
          paddingVertical: theme.spacing["2xl"]
        }}
      >
        {!account.session && (
          <Text style={[theme.typography.label, { color: theme.colors.brand }]}>ANTHRA</Text>
        )}
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={1.25}
          style={[theme.typography.display, { color: theme.colors.textPrimary, marginTop: account.session ? 0 : theme.spacing.sm }]}
        >
          {account.session ? "Protecting your data" : installation.installKind === "legacy" ? "Welcome back" : "Welcome to Anthra"}
        </Text>
        <Text
          maxFontSizeMultiplier={1.35}
          style={[theme.typography.bodyLarge, { color: theme.colors.textSecondary, marginTop: theme.spacing.md, marginBottom: theme.spacing.xl }]}
        >
          {account.session
            ? "Anthra is creating and verifying your private cloud copy. Nothing is removed from this phone."
            : "Sign in to continue."}
        </Text>

        {migrationRunning ? (
          <Card padding="large">
            <View style={{ alignItems: "center", gap: theme.spacing.md }}>
              <ActivityIndicator color={theme.colors.brand} size="large" />
              <Cloud accessible={false} color={theme.colors.brand} size={28} />
              <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, textAlign: "center" }]}> 
                {account.legacyImportProgress?.state === "verifying"
                  ? "Verifying the cloud copy"
                  : `Uploading ${account.legacyImportProgress?.uploaded ?? 0}/${account.legacyImportProgress?.total ?? 0} records`}
              </Text>
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: "center" }]}>You can safely retry if connectivity is interrupted.</Text>
            </View>
          </Card>
        ) : migrationFailed ? (
          <View style={{ gap: theme.spacing.md }}>
            <StatusBanner
              variant="danger"
              title="Cloud verification did not complete"
              message={account.error ?? "Your local records remain unchanged."}
            />
            <Button
              label="Retry secure migration"
              icon={ShieldCheck}
              loading={busy}
              disabled={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await account.retryLegacyImport();
                } catch {
                  // AccountProvider exposes the actionable error in the banner.
                } finally {
                  setBusy(false);
                }
              }}
            />
            {canContinueOffline && (
              <Button
                label="Cancel sign-in and continue offline"
                variant="ghost"
                fullWidth
                loading={busy}
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    await account.signOut();
                    await account.continueOffline();
                  } catch {
                    // Local records remain untouched if either operation fails.
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </View>
        ) : (
          <Card padding="large" radius="xlarge" style={{ marginTop: theme.spacing.sm }}>
            <AuthForm legacy={installation.installKind === "legacy"} />
          </Card>
        )}

        {canContinueOffline && decision === "authenticate" && (
          <Button
            label="Continue offline for now"
            variant="ghost"
            fullWidth
            loading={busy}
            disabled={busy}
            style={{ marginTop: theme.spacing.lg }}
            onPress={async () => {
              setBusy(true);
              try {
                await account.continueOffline();
              } catch {
                // AccountProvider retains the local data if this state update fails.
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
      </KeyboardAwareScrollView>
    </ScreenLayout>
  );
}
