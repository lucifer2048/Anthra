import { useRef } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, useWindowDimensions, View } from "react-native";
import { KeyRound, RotateCcwKey, ShieldCheck } from "lucide-react-native";

import { useAnthraTheme } from "../design-system";
import { Button, Card, KeyboardAwareScrollView, StatusBanner, TextField } from "./ui";

type VaultResetPinModalProps = {
  visible: boolean;
  currentPin: string;
  newPin: string;
  confirmPin: string;
  saving: boolean;
  error: string;
  onChangeCurrentPin: (value: string) => void;
  onChangeNewPin: (value: string) => void;
  onChangeConfirmPin: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function VaultResetPinModal({
  visible,
  currentPin,
  newPin,
  confirmPin,
  saving,
  error,
  onChangeCurrentPin,
  onChangeNewPin,
  onChangeConfirmPin,
  onClose,
  onSubmit
}: VaultResetPinModalProps) {
  const anthraTheme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const stackActions = width < 420 || fontScale >= 1.2;
  const newPinInputRef = useRef<TextInput>(null);
  const confirmPinInputRef = useRef<TextInput>(null);
  const securePinFieldProps = {
    secureTextEntry: true,
    autoComplete: "off" as const,
    autoCorrect: false,
    spellCheck: false,
    importantForAutofill: "no" as const,
    textContentType: "none" as const,
    keyboardType: "number-pad" as const,
    maxLength: 8
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: anthraTheme.colors.scrim }}
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
                <RotateCcwKey accessible={false} color={anthraTheme.colors.brand} size={23} />
              </View>
              <View className="min-w-0 flex-1">
                <Text style={[anthraTheme.typography.label, { color: anthraTheme.colors.brand }]}>VAULT SECURITY</Text>
                <Text
                  accessibilityRole="header"
                  style={[
                    anthraTheme.typography.titleLarge,
                    { color: anthraTheme.colors.textPrimary, marginTop: 2 }
                  ]}
                >
                  Reset vault PIN
                </Text>
              </View>
            </View>

            <Text
              style={[
                anthraTheme.typography.body,
                { color: anthraTheme.colors.textSecondary, marginTop: anthraTheme.spacing.md }
              ]}
            >
              Confirm your current PIN, then choose a new 4 to 8 digit PIN.
            </Text>

            {error.length > 0 && (
              <StatusBanner
                title="PIN couldn’t be changed"
                message={error}
                variant="danger"
                style={{ marginTop: anthraTheme.spacing.lg }}
              />
            )}

            <TextField
              {...securePinFieldProps}
              label="Current PIN"
              value={currentPin}
              onChangeText={onChangeCurrentPin}
              autoFocus
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => newPinInputRef.current?.focus()}
              placeholder="Enter current PIN"
              leadingIcon={KeyRound}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.xl }}
            />
            <TextField
              {...securePinFieldProps}
              ref={newPinInputRef}
              label="New PIN"
              value={newPin}
              onChangeText={onChangeNewPin}
              placeholder="Choose 4–8 digits"
              leadingIcon={ShieldCheck}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmPinInputRef.current?.focus()}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.lg }}
            />
            <TextField
              {...securePinFieldProps}
              ref={confirmPinInputRef}
              label="Confirm new PIN"
              value={confirmPin}
              onChangeText={onChangeConfirmPin}
              placeholder="Repeat your new PIN"
              leadingIcon={ShieldCheck}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!saving) onSubmit();
              }}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.lg }}
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
                onPress={onClose}
                disabled={saving}
                accessibilityLabel="Cancel vault PIN reset"
                style={{ flex: stackActions ? undefined : 1, alignSelf: "stretch" }}
              />
              <Button
                label="Reset PIN"
                icon={RotateCcwKey}
                onPress={onSubmit}
                loading={saving}
                disabled={saving}
                accessibilityLabel="Reset vault PIN"
                style={{ flex: stackActions ? undefined : 1, alignSelf: "stretch" }}
              />
            </View>
          </Card>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
