import { useRef } from "react";
import { TextInput } from "react-native";
import { KeyRound, RotateCcwKey, ShieldCheck } from "lucide-react-native";
import { useAnthraTheme } from "../design-system";
import { FormDialog, TextField } from "./ui";

type Props = {
  visible: boolean; currentPin: string; newPin: string; confirmPin: string; saving: boolean; error: string;
  onChangeCurrentPin: (value: string) => void; onChangeNewPin: (value: string) => void; onChangeConfirmPin: (value: string) => void;
  onClose: () => void; onSubmit: () => void;
};

export function VaultResetPinModal({ visible, currentPin, newPin, confirmPin, saving, error, onChangeCurrentPin, onChangeNewPin, onChangeConfirmPin, onClose, onSubmit }: Props) {
  const theme = useAnthraTheme();
  const newPinRef = useRef<TextInput>(null);
  const confirmPinRef = useRef<TextInput>(null);
  const secure = { secureTextEntry: true, autoComplete: "off" as const, autoCorrect: false, spellCheck: false, importantForAutofill: "no" as const, textContentType: "none" as const, keyboardType: "number-pad" as const, maxLength: 8 };
  return (
    <FormDialog visible={visible} title="Reset vault PIN" subtitle="Confirm your current PIN, then choose a new 4 to 8 digit PIN." onClose={onClose} backdropDismissEnabled={!saving} error={error || null} primaryAction={{ label: "Reset PIN", icon: RotateCcwKey, onPress: onSubmit, loading: saving }} secondaryAction={{ label: "Cancel", onPress: onClose, disabled: saving }}>
      <TextField {...secure} label="Current PIN" value={currentPin} onChangeText={onChangeCurrentPin} autoFocus leadingIcon={KeyRound} required returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => newPinRef.current?.focus()} />
      <TextField {...secure} ref={newPinRef} label="New PIN" value={newPin} onChangeText={onChangeNewPin} leadingIcon={ShieldCheck} required returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmPinRef.current?.focus()} containerStyle={{ marginTop: theme.spacing.lg }} />
      <TextField {...secure} ref={confirmPinRef} label="Confirm new PIN" value={confirmPin} onChangeText={onChangeConfirmPin} leadingIcon={ShieldCheck} required returnKeyType="done" onSubmitEditing={() => { if (!saving) onSubmit(); }} containerStyle={{ marginTop: theme.spacing.lg }} />
    </FormDialog>
  );
}
