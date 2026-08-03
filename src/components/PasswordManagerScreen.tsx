import { useMemo, useRef, useState } from "react";
import { Platform, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcwKey,
  Search,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react-native";

import { useAnthraTheme } from "../design-system";
import type { VaultEntry } from "../types";
import { Button, Card, ScreenHeader, StatusBanner, Surface, SwitchRow, TextField } from "./ui";

type PasswordManagerScreenProps = {
  keyboardBottomPadding: number;
  hasPin: boolean;
  unlocked: boolean;
  newPin: string;
  confirmPin: string;
  biometricsEnabled: boolean;
  entries: VaultEntry[];
  revealedEntryIds: number[];
  notice: { type: "success" | "error"; message: string } | null;
  onBack: () => void;
  onChangeNewPin: (value: string) => void;
  onChangeConfirmPin: (value: string) => void;
  onSetupPin: () => void;
  onUnlock: () => void;
  onToggleBiometrics: () => void;
  onResetPin: () => void;
  onAddEntry: () => void;
  onEditEntry: (entry: VaultEntry) => void;
  onDeleteEntry: (entry: VaultEntry) => void;
  onToggleEntryVisibility: (entryId: number, visible: boolean) => void;
  onCopyEntryPassword: (entryId: number) => void;
};

export function PasswordManagerScreen({
  keyboardBottomPadding,
  hasPin,
  unlocked,
  newPin,
  confirmPin,
  biometricsEnabled,
  entries,
  revealedEntryIds,
  notice,
  onBack,
  onChangeNewPin,
  onChangeConfirmPin,
  onSetupPin,
  onUnlock,
  onToggleBiometrics,
  onResetPin,
  onAddEntry,
  onEditEntry,
  onDeleteEntry,
  onToggleEntryVisibility,
  onCopyEntryPassword
}: PasswordManagerScreenProps) {
  const anthraTheme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const shouldStackCardActions = width < 420 || fontScale >= 1.2;
  const [searchText, setSearchText] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [headerHeight, setHeaderHeight] = useState(0);
  const confirmPinInputRef = useRef<TextInput>(null);
  const filteredEntries = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      `${entry.appName} ${entry.accountId}`.toLocaleLowerCase().includes(query)
    );
  }, [entries, searchText]);

  const copyValue = async (label: "Username" | "Password", value: string) => {
    await Clipboard.setStringAsync(value);
    setCopyNotice(`${label} copied. Clipboard clears in 30 seconds.`);
    setTimeout(() => setCopyNotice(""), 3000);
    setTimeout(async () => {
      const currentValue = await Clipboard.getStringAsync();
      if (currentValue === value) await Clipboard.setStringAsync("");
    }, 30_000);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: anthraTheme.colors.canvas }}
    >
      <StatusBar style={anthraTheme.statusBarStyle} backgroundColor={anthraTheme.colors.canvas} translucent={false} />
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{
          paddingHorizontal: anthraTheme.layout.screenPadding,
          borderBottomWidth: 1,
          borderBottomColor: anthraTheme.colors.divider,
          backgroundColor: anthraTheme.colors.canvas
        }}
      >
        <ScreenHeader
          eyebrow="PRIVATE"
          title="Vault"
          subtitle="Your credentials stay protected on this device."
          onBack={onBack}
          backLabel="Back to Anthra home"
          style={{ width: "100%", maxWidth: anthraTheme.layout.contentMaxWidth, alignSelf: "center" }}
        />
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: "100%",
          maxWidth: anthraTheme.layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: anthraTheme.layout.screenPadding,
          paddingTop: anthraTheme.spacing.xl,
          paddingBottom: keyboardBottomPadding
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        {!hasPin && (
          <Card variant="brand" padding="large">
            <View
              className="items-center justify-center"
              style={{
                width: 52,
                height: 52,
                borderRadius: anthraTheme.radii.lg,
                backgroundColor: anthraTheme.colors.surface
              }}
            >
              <LockKeyhole accessible={false} color={anthraTheme.colors.brand} size={25} />
            </View>
            <Text
              accessibilityRole="header"
              style={[
                anthraTheme.typography.titleLarge,
                { color: anthraTheme.colors.textPrimary, marginTop: anthraTheme.spacing.lg }
              ]}
            >
              Protect your vault
            </Text>
            <Text
              style={[
                anthraTheme.typography.body,
                { color: anthraTheme.colors.textSecondary, marginTop: anthraTheme.spacing.xs }
              ]}
            >
              Create a memorable 4 to 8 digit PIN. You’ll use it before sensitive actions.
            </Text>

            <TextField
              label="New PIN"
              value={newPin}
              onChangeText={onChangeNewPin}
              secureTextEntry
              autoComplete="off"
              autoCorrect={false}
              spellCheck={false}
              importantForAutofill="no"
              textContentType="none"
              keyboardType="number-pad"
              maxLength={8}
              placeholder="4–8 digits"
              leadingIcon={KeyRound}
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmPinInputRef.current?.focus()}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.xl }}
            />
            <TextField
              ref={confirmPinInputRef}
              label="Confirm PIN"
              value={confirmPin}
              onChangeText={onChangeConfirmPin}
              secureTextEntry
              autoComplete="off"
              autoCorrect={false}
              spellCheck={false}
              importantForAutofill="no"
              textContentType="none"
              keyboardType="number-pad"
              maxLength={8}
              placeholder="Repeat your PIN"
              leadingIcon={ShieldCheck}
              returnKeyType="done"
              onSubmitEditing={onSetupPin}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.lg }}
            />
            <Button
              label="Create vault PIN"
              icon={LockKeyhole}
              onPress={onSetupPin}
              fullWidth
              size="large"
              style={{ marginTop: anthraTheme.spacing.xl }}
            />
          </Card>
        )}

        {hasPin && !unlocked && (
          <Card variant="elevated" padding="large">
            <View
              className="items-center justify-center self-center"
              style={{
                width: 64,
                height: 64,
                borderRadius: anthraTheme.radii.full,
                backgroundColor: anthraTheme.colors.brandSoft
              }}
            >
              <LockKeyhole accessible={false} color={anthraTheme.colors.brand} size={29} />
            </View>
            <Text
              accessibilityRole="header"
              style={[
                anthraTheme.typography.titleLarge,
                {
                  color: anthraTheme.colors.textPrimary,
                  textAlign: "center",
                  marginTop: anthraTheme.spacing.lg
                }
              ]}
            >
              Vault locked
            </Text>
            <Text
              style={[
                anthraTheme.typography.body,
                {
                  color: anthraTheme.colors.textSecondary,
                  textAlign: "center",
                  marginTop: anthraTheme.spacing.xs
                }
              ]}
            >
              Verify your PIN to view or manage saved credentials.
            </Text>
            <Button
              label="Unlock vault"
              icon={KeyRound}
              accessibilityHint="Opens secure PIN verification"
              onPress={onUnlock}
              fullWidth
              size="large"
              style={{ marginTop: anthraTheme.spacing.xl }}
            />
          </Card>
        )}

        {hasPin && unlocked && (
          <>
            <View className="flex-row items-center" style={{ gap: anthraTheme.spacing.md }}>
              <View className="min-w-0 flex-1">
                <Text
                  accessibilityRole="header"
                  style={[anthraTheme.typography.titleLarge, { color: anthraTheme.colors.textPrimary }]}
                >
                  Saved credentials
                </Text>
                <Text
                  style={[
                    anthraTheme.typography.body,
                    { color: anthraTheme.colors.textSecondary, marginTop: anthraTheme.spacing.xs }
                  ]}
                >
                  {entries.length} {entries.length === 1 ? "account" : "accounts"} in your vault
                </Text>
              </View>
              <Button label="Add" icon={Plus} onPress={onAddEntry} />
            </View>

            <TextField
              label="Search vault"
              value={searchText}
              onChangeText={setSearchText}
              placeholder="App, website, or username"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search saved credentials"
              leadingIcon={Search}
              containerStyle={{ marginTop: anthraTheme.spacing.xl }}
            />

            <View style={{ gap: anthraTheme.spacing.sm, marginTop: anthraTheme.spacing.lg }}>
              <SwitchRow
                label="Biometric unlock"
                description={biometricsEnabled
                  ? "Use device biometrics after opening the vault."
                  : "Use device biometrics for faster secure access."}
                value={biometricsEnabled}
                onValueChange={onToggleBiometrics}
                accessibilityLabel="Biometric vault unlock"
                accessibilityHint="Toggles biometric unlock for this vault"
              />
              <Button
                label="Reset vault PIN"
                icon={RotateCcwKey}
                onPress={onResetPin}
                variant="outline"
                fullWidth
                accessibilityHint="Verifies your current PIN before choosing a new PIN"
              />
            </View>

            {entries.length === 0 && (
              <Card variant="subtle" padding="large" style={{ marginTop: anthraTheme.spacing.xl }}>
                <View
                  className="items-center justify-center self-center"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: anthraTheme.radii.full,
                    backgroundColor: anthraTheme.colors.brandSoft
                  }}
                >
                  <KeyRound accessible={false} color={anthraTheme.colors.brand} size={25} />
                </View>
                <Text
                  style={[
                    anthraTheme.typography.titleMedium,
                    { color: anthraTheme.colors.textPrimary, textAlign: "center", marginTop: anthraTheme.spacing.lg }
                  ]}
                >
                  Your vault is ready
                </Text>
                <Text
                  style={[
                    anthraTheme.typography.body,
                    { color: anthraTheme.colors.textSecondary, textAlign: "center", marginTop: anthraTheme.spacing.xs }
                  ]}
                >
                  Add your first login to keep it close and protected.
                </Text>
                <Button
                  label="Add first credential"
                  icon={Plus}
                  variant="secondary"
                  onPress={onAddEntry}
                  fullWidth
                  style={{ marginTop: anthraTheme.spacing.xl }}
                />
              </Card>
            )}

            {entries.length > 0 && filteredEntries.length === 0 && (
              <Card variant="subtle" padding="large" style={{ marginTop: anthraTheme.spacing.xl }}>
                <Search accessible={false} color={anthraTheme.colors.textTertiary} size={26} />
                <Text
                  style={[
                    anthraTheme.typography.titleMedium,
                    { color: anthraTheme.colors.textPrimary, marginTop: anthraTheme.spacing.md }
                  ]}
                >
                  No matches
                </Text>
                <Text
                  style={[
                    anthraTheme.typography.body,
                    { color: anthraTheme.colors.textSecondary, marginTop: anthraTheme.spacing.xs }
                  ]}
                >
                  No credentials match “{searchText.trim()}”. Try a different app or username.
                </Text>
              </Card>
            )}

            <View style={{ gap: anthraTheme.spacing.md, marginTop: filteredEntries.length > 0 ? anthraTheme.spacing.xl : 0 }}>
              {filteredEntries.map((entry) => {
                const visible = revealedEntryIds.includes(entry.id);
                return (
                  <Card key={entry.id} variant="elevated" padding="large">
                    <View className="flex-row items-start" style={{ gap: anthraTheme.spacing.md }}>
                      <View
                        className="items-center justify-center"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: anthraTheme.radii.md,
                          backgroundColor: anthraTheme.colors.brandSoft
                        }}
                      >
                        <KeyRound accessible={false} color={anthraTheme.colors.brand} size={21} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text
                          numberOfLines={2}
                          style={[anthraTheme.typography.titleMedium, { color: anthraTheme.colors.textPrimary }]}
                        >
                          {entry.appName}
                        </Text>
                        <View className="flex-row items-center" style={{ gap: 5, marginTop: anthraTheme.spacing.xs }}>
                          <UserRound accessible={false} color={anthraTheme.colors.textTertiary} size={14} />
                          <Text
                            numberOfLines={1}
                            style={[anthraTheme.typography.body, { color: anthraTheme.colors.textSecondary, flexShrink: 1 }]}
                          >
                            {entry.accountId}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Surface
                      variant="subtle"
                      padding="small"
                      radius="medium"
                      style={{ marginTop: anthraTheme.spacing.lg }}
                    >
                      <Text style={[anthraTheme.typography.caption, { color: anthraTheme.colors.textSecondary }]}>PASSWORD</Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          anthraTheme.typography.bodyLarge,
                          {
                            color: anthraTheme.colors.textPrimary,
                            letterSpacing: visible ? 0 : 2,
                            marginTop: anthraTheme.spacing.xs
                          }
                        ]}
                      >
                        {visible ? entry.secret : "••••••••••••"}
                      </Text>
                    </Surface>

                    <View
                      style={{
                        flexDirection: shouldStackCardActions ? "column" : "row",
                        gap: anthraTheme.spacing.sm,
                        marginTop: anthraTheme.spacing.md
                      }}
                    >
                      <Button
                        label="Copy username"
                        icon={Copy}
                        variant="outline"
                        onPress={() => copyValue("Username", entry.accountId).catch(() => undefined)}
                        accessibilityLabel={`Copy username for ${entry.appName}`}
                        style={{ flex: shouldStackCardActions ? undefined : 1, alignSelf: "stretch" }}
                      />
                      <Button
                        label="Copy password"
                        icon={ShieldCheck}
                        variant="secondary"
                        onPress={() => onCopyEntryPassword(entry.id)}
                        accessibilityLabel={`Securely copy password for ${entry.appName}`}
                        accessibilityHint={biometricsEnabled
                          ? "Uses biometrics first, with vault PIN as a fallback"
                          : "Asks for your vault PIN before copying"}
                        style={{ flex: shouldStackCardActions ? undefined : 1, alignSelf: "stretch" }}
                      />
                    </View>
                    <View
                      style={{
                        flexDirection: shouldStackCardActions ? "column" : "row",
                        gap: anthraTheme.spacing.sm,
                        marginTop: anthraTheme.spacing.sm
                      }}
                    >
                      <Button
                        label={visible ? "Hide" : "Show"}
                        icon={visible ? EyeOff : Eye}
                        variant="ghost"
                        onPress={() => onToggleEntryVisibility(entry.id, visible)}
                        accessibilityLabel={`${visible ? "Hide" : "Show"} password for ${entry.appName}`}
                        accessibilityHint={visible
                          ? "Hides the password immediately"
                          : biometricsEnabled
                            ? "Uses biometrics first, with vault PIN as a fallback"
                            : "Asks for your vault PIN before showing the password"}
                        style={{ flex: shouldStackCardActions ? undefined : 1, alignSelf: "stretch" }}
                      />
                      <Button
                        label="Edit"
                        icon={Pencil}
                        variant="outline"
                        onPress={() => onEditEntry(entry)}
                        accessibilityLabel={`Edit ${entry.appName}`}
                        style={{ flex: shouldStackCardActions ? undefined : 1, alignSelf: "stretch" }}
                      />
                      <Button
                        label="Delete"
                        icon={Trash2}
                        variant="danger"
                        onPress={() => onDeleteEntry(entry)}
                        accessibilityLabel={`Delete ${entry.appName}`}
                        style={{ flex: shouldStackCardActions ? undefined : 1, alignSelf: "stretch" }}
                      />
                    </View>
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {(notice || copyNotice) && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            zIndex: 100,
            elevation: 12,
            top: headerHeight + anthraTheme.spacing.md,
            left: anthraTheme.layout.screenPadding,
            right: anthraTheme.layout.screenPadding
          }}
        >
          <StatusBanner
            title={copyNotice ? "Copied securely" : notice?.type === "success" ? "Vault updated" : "Vault needs attention"}
            message={copyNotice || notice?.message}
            variant={copyNotice || notice?.type === "success" ? "success" : "danger"}
            style={{
              width: "100%",
              maxWidth: 520,
              alignSelf: "center",
              shadowColor: anthraTheme.isDark ? "#000000" : "#5D1B16",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: anthraTheme.isDark ? 0.38 : 0.18,
              shadowRadius: 18
            }}
          />
        </View>
      )}
    </SafeAreaView>
  );
}
