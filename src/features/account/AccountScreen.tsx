import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Camera, Cloud, LogOut } from "lucide-react-native";

import { useScreenBackgrounds } from "../../components/layout";
import { AnimatedPressable, Button, Card, ScreenShell, StatusBanner, SwitchRow, TextField } from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { AuthForm } from "./AuthForm";
import { useAccount } from "./AccountProvider";
import { ProfileAvatar } from "./ProfileAvatar";

export function AccountScreen({ onBack }: { onBack: () => void }) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const account = useAccount();
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [discoverable, setDiscoverable] = useState(true);
  const [busy, setBusy] = useState<"profile" | "photo" | "signout" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!account.profile) return;
    setDisplayName(account.profile.displayName);
    setHandle(account.profile.handle);
    setDiscoverable(account.profile.discoverable);
  }, [account.profile]);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    try {
      await task();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "The profile action could not be completed."
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScreenShell background={backgrounds.brandWash} keyboardAware header={{ eyebrow: "ANTHRA PROFILE", title: account.user ? "Your profile" : "Account", subtitle: account.user ? "Manage how you appear to friends." : "Sign in to sync safely and connect with friends.", onBack }}>

          {!account.cloudAvailable ? (
            <StatusBanner
              variant="warning"
              title="Cloud is not configured in this build"
              message="Your existing Anthra data remains available on this device."
            />
          ) : !account.user ? (
            <AuthForm legacy={account.installation?.installKind === "legacy"} />
          ) : (
            <View style={{ gap: theme.spacing.lg }}>
              <Card padding="large">
                <View style={{ alignItems: "center" }}>
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel="Change profile picture"
                    disabled={busy !== null || account.profileLoading}
                    onPress={() => run("photo", account.chooseProfilePhoto)}
                    style={{ position: "relative" }}
                  >
                    <View
                      style={{
                        width: 104,
                        height: 104,
                        borderRadius: 52,
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        borderWidth: 2,
                        borderColor: theme.colors.brandBorder,
                        backgroundColor: theme.colors.brandSoft
                      }}
                    >
                      <ProfileAvatar
                        uri={account.profile?.avatarUrl}
                        size={104}
                        fallbackColor={theme.colors.brand}
                        backgroundColor={theme.colors.brandSoft}
                      />
                      {busy === "photo" ? <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.scrim }}><ActivityIndicator color={theme.colors.textOnBrandSolid} accessibilityLabel="Updating profile photo" /></View> : null}
                    </View>
                    <View
                      style={{
                        position: "absolute",
                        right: 0,
                        bottom: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.colors.brandSolid,
                        borderWidth: 2,
                        borderColor: theme.colors.surface
                      }}
                    >
                      <Camera accessible={false} color={theme.colors.textOnBrandSolid} size={17} />
                    </View>
                  </AnimatedPressable>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>
                    {account.user.email}
                  </Text>
                </View>

                <TextField
                  label="Display name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your name"
                  maxLength={80}
                  disabled={busy !== null || account.profileLoading}
                  containerStyle={{ marginTop: theme.spacing.xl }}
                />
                <TextField
                  label="Username"
                  value={handle}
                  onChangeText={(value) => setHandle(value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="anthra_user"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={24}
                  helperText="3–24 lowercase letters, numbers, or underscores. Used for friend discovery."
                  disabled={busy !== null || account.profileLoading}
                  containerStyle={{ marginTop: theme.spacing.lg }}
                />
                <SwitchRow
                  label="Allow friend discovery"
                  description="People can find you using your display name or username. Your email is never shown."
                  value={discoverable}
                  onValueChange={setDiscoverable}
                  disabled={busy !== null || account.profileLoading}
                  style={{ marginTop: theme.spacing.lg }}
                />
                <Button
                  label="Save profile"
                  fullWidth
                  loading={busy === "profile" || account.profileLoading}
                  disabled={busy !== null || !displayName.trim()}
                  style={{ marginTop: theme.spacing.xl }}
                  onPress={() =>
                    run("profile", async () => {
                      await account.saveProfile({ displayName, handle, discoverable });
                      setNotice({ type: "success", message: "Profile saved." });
                    })
                  }
                />
              </Card>

              <Card padding="large">
                <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
                  <Cloud accessible={false} color={theme.colors.brand} size={24} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Cloud protection</Text>
                    <Text
                      numberOfLines={4}
                      maxFontSizeMultiplier={1.4}
                      style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}
                    >
                      {account.legacyImportPrepared
                        ? "Existing records were uploaded and server-verified. Offline data remains on this phone."
                        : "Anthra is preparing and verifying your existing records."}
                    </Text>
                  </View>
                </View>
              </Card>

              <Button
                label="Sign out"
                icon={LogOut}
                variant="danger"
                loading={busy === "signout"}
                disabled={busy !== null}
                onPress={() => run("signout", account.signOut)}
              />
            </View>
          )}

          {(notice || account.error) && account.user && (
            <StatusBanner
              style={{ marginTop: theme.spacing.lg }}
              variant={notice?.type === "success" ? "success" : "danger"}
              title={notice?.type === "success" ? "Updated" : "Profile unavailable"}
              message={notice?.message ?? account.error ?? undefined}
            />
          )}
    </ScreenShell>
  );
}
