import { ClipboardCopy, Eye, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react-native";
import { FormDialog, TextField } from "./ui";

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
  const unlocking = props.mode === "unlock";
  const copying = props.mode === "copy";
  const title = unlocking ? "Unlock vault" : copying ? "Copy password" : "Reveal password";
  const actionLabel = unlocking ? "Unlock vault" : copying ? "Copy password" : "Reveal password";
  const HeaderIcon = unlocking ? LockKeyhole : copying ? ClipboardCopy : Eye;
  return (
    <FormDialog
      visible={props.visible}
      title={title}
      subtitle={unlocking ? "Enter your PIN to open your protected credentials." : copying ? "Verify your PIN before the password is copied for 30 seconds." : "Verify your PIN before showing this password on screen."}
      onClose={props.onClose}
      backdropDismissEnabled={!props.verifying}
      error={props.error || null}
      primaryAction={{ label: actionLabel, icon: ShieldCheck, onPress: props.onVerify, loading: props.verifying, disabled: props.verifying }}
      secondaryAction={{ label: "Cancel", onPress: props.onClose, disabled: props.verifying }}
    >
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
        leadingIcon={HeaderIcon ?? KeyRound}
        required
        onSubmitEditing={() => { if (!props.verifying) props.onVerify(); }}
      />
    </FormDialog>
  );
}
