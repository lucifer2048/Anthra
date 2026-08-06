import { KeyboardAvoidingView, Modal, Platform, Text, useWindowDimensions, View } from "react-native";
import { ClipboardCopy, Eye, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react-native";

import { useAnthraTheme } from "../design-system";
import { Button, Card, KeyboardAwareScrollView, StatusBanner, TextField } from "./ui";

type VaultPinModalProps = {
  visible: boolean;
  mode: "unlock" | "reveal" | "copy";
  pin: string;
  error: string;
  verifying: boolean;
  onChangePin: (value: string) => void;
  onClose: () => void;
  onVerify: () => void;
};

export function VaultPinModal(props: VaultPinModalProps) {
  const anthraTheme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width < 420 || fontScale >= 1.2;
  const unlocking = props.mode === "unlock";
  const copying = props.mode === "copy";
  const title = unlocking ? "Unlock vault" : copying ? "Copy password" : "Reveal password";
  const actionLabel = unlocking ? "Unlock vault" : copying ? "Copy password" : "Reveal password";
  const HeaderIcon = unlocking ? LockKeyhole : copying ? ClipboardCopy : Eye;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!props.verifying) props.onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        style={{ backgroundColor: anthraTheme.colors.scrim }}
      >
        <KeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            paddingHorizontal: anthraTheme.spacing.xl,
            paddingVertical: anthraTheme.spacing["3xl"]
          }}
        >
        <Card
          accessibilityViewIsModal
          variant="elevated"
          padding="large"
          style={{ width: "100%", maxWidth: 520, alignSelf: "center" }}
        >
          <View className="flex-row items-start" style={{ gap: anthraTheme.spacing.md }}>
            <View
              className="items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: anthraTheme.radii.md,
                backgroundColor: anthraTheme.colors.brandSoft
              }}
            >
              <HeaderIcon accessible={false} color={anthraTheme.colors.brand} size={23} />
            </View>
            <View className="min-w-0 flex-1">
              <Text style={[anthraTheme.typography.label, { color: anthraTheme.colors.brand }]}>SECURITY CHECK</Text>
              <Text
                accessibilityRole="header"
                style={[
                  anthraTheme.typography.titleLarge,
                  { color: anthraTheme.colors.textPrimary, marginTop: 2 }
                ]}
              >
                {title}
              </Text>
            </View>
          </View>

          <Text
            style={[
              anthraTheme.typography.body,
              { color: anthraTheme.colors.textSecondary, marginTop: anthraTheme.spacing.md }
            ]}
          >
            {unlocking
              ? "Enter your PIN to open your protected credentials."
              : copying
                ? "Verify your PIN before the password is copied for 30 seconds."
                : "Verify your PIN before showing this password on screen."}
          </Text>

          {props.error.length > 0 && (
            <StatusBanner
              title="PIN not verified"
              message={props.error}
              variant="danger"
              style={{ marginTop: anthraTheme.spacing.lg }}
            />
          )}

          <TextField
            label="Vault PIN"
            value={props.pin}
            onChangeText={props.onChangePin}
            autoFocus
            secureTextEntry
            autoComplete="off"
            autoCorrect={false}
            spellCheck={false}
            importantForAutofill="no"
            textContentType="none"
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={8}
            placeholder="Enter your PIN"
            leadingIcon={KeyRound}
            required
            onSubmitEditing={() => {
              if (!props.verifying) props.onVerify();
            }}
            containerStyle={{ marginTop: anthraTheme.spacing.xl }}
          />

          <View
            style={{
              flexDirection: stackActions ? "column" : "row",
              gap: anthraTheme.spacing.md,
              paddingTop: anthraTheme.spacing.xl,
              marginTop: anthraTheme.spacing.xl,
              borderTopWidth: 1,
              borderTopColor: anthraTheme.colors.divider
            }}
          >
            <Button
              label="Cancel"
              variant="outline"
              onPress={props.onClose}
              disabled={props.verifying}
              accessibilityLabel="Cancel PIN verification"
              accessibilityHint={props.verifying ? "PIN verification is in progress" : undefined}
              accessibilityState={{ disabled: props.verifying }}
              style={{ flex: stackActions ? undefined : 1, alignSelf: "stretch" }}
            />
            <Button
              label={actionLabel}
              icon={ShieldCheck}
              onPress={props.onVerify}
              loading={props.verifying}
              disabled={props.verifying}
              accessibilityLabel={`${actionLabel} after verifying PIN`}
              style={{ flex: stackActions ? undefined : 1, alignSelf: "stretch" }}
            />
          </View>
        </Card>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
