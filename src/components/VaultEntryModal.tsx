import { useEffect, useReducer, useRef } from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Eye, EyeOff, KeyRound, ShieldCheck, WandSparkles } from "lucide-react-native";

import { useAnthraTheme } from "../design-system";
import { Button, FormDialog, TextField } from "./ui";
import {
  INITIAL_VAULT_EDITOR_PRIVACY_STATE,
  vaultEditorPrivacyReducer,
} from "../features/vault/editorPrivacy";

type VaultEntryModalProps = {
  visible: boolean;
  editing: boolean;
  appName: string;
  accountId: string;
  secret: string;
  error: string;
  saving: boolean;
  onChangeAppName: (value: string) => void;
  onChangeAccountId: (value: string) => void;
  onChangeSecret: (value: string) => void;
  onGenerateSecret: () => Promise<void>;
  onClose: () => void;
  onSave: () => void;
};

export function VaultEntryModal(props: VaultEntryModalProps) {
  if (!props.visible) {
    return null;
  }

  return <VaultEntryEditor {...props} />;
}

function VaultEntryEditor(props: VaultEntryModalProps) {
  const anthraTheme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const shouldStackActions = width < 420 || fontScale >= 1.2;
  const [privacyState, dispatchPrivacy] = useReducer(
    vaultEditorPrivacyReducer,
    INITIAL_VAULT_EDITOR_PRIVACY_STATE,
  );
  const nextGenerationIdRef = useRef(0);
  const activeGenerationIdRef = useRef<number | null>(null);
  const appNameInputRef = useRef<TextInput>(null);
  const accountInputRef = useRef<TextInput>(null);
  const secretInputRef = useRef<TextInput>(null);

  useEffect(() => () => {
    activeGenerationIdRef.current = null;
    nextGenerationIdRef.current += 1;
  }, []);

  const closeEditor = () => {
    activeGenerationIdRef.current = null;
    nextGenerationIdRef.current += 1;
    dispatchPrivacy({ type: "reset" });
    props.onClose();
  };

  const generateSecret = async () => {
    if (activeGenerationIdRef.current !== null) {
      return;
    }

    const generationId = nextGenerationIdRef.current + 1;
    nextGenerationIdRef.current = generationId;
    activeGenerationIdRef.current = generationId;
    dispatchPrivacy({ type: "generation-started", generationId });

    try {
      await props.onGenerateSecret();
      dispatchPrivacy({ type: "generation-succeeded", generationId });
    } catch (error) {
      dispatchPrivacy({ type: "generation-failed", generationId });
      throw error;
    } finally {
      if (activeGenerationIdRef.current === generationId) {
        activeGenerationIdRef.current = null;
      }
    }
  };

  return (
    <FormDialog visible title={props.editing ? "Edit credential" : "Add credential"} subtitle="Details are stored in your protected on-device vault." onClose={closeEditor} backdropDismissEnabled={!props.saving && !privacyState.generating} error={props.error || null} primaryAction={{ label: "Save credential", icon: ShieldCheck, onPress: props.onSave, loading: props.saving }} secondaryAction={{ label: "Cancel", onPress: closeEditor, disabled: props.saving }} maxWidth={anthraTheme.layout.contentMaxWidth}>

            <TextField
              ref={appNameInputRef}
              label="App or website"
              value={props.appName}
              onChangeText={props.onChangeAppName}
              placeholder="Example: Anthra"
              accessibilityLabel="App or website"
              autoComplete="off"
              autoCorrect={false}
              spellCheck={false}
              importantForAutofill="no"
              textContentType="none"
              autoFocus
              selectTextOnFocus={props.editing}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => accountInputRef.current?.focus()}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.xl }}
            />
            <TextField
              ref={accountInputRef}
              label="Login ID or username"
              value={props.accountId}
              onChangeText={props.onChangeAccountId}
              placeholder="name@example.com"
              accessibilityLabel="Login ID or username"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              spellCheck={false}
              importantForAutofill="no"
              textContentType="none"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => secretInputRef.current?.focus()}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.lg }}
            />
            <TextField
              ref={secretInputRef}
              label="Password"
              value={props.secret}
              onChangeText={props.onChangeSecret}
              placeholder="Enter or generate a password"
              accessibilityLabel="Password"
              accessibilityHint={privacyState.secretVisible
                ? "The password is currently visible."
                : "The password is currently hidden."}
              secureTextEntry={!privacyState.secretVisible}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              spellCheck={false}
              importantForAutofill="no"
              textContentType="none"
              leadingIcon={ShieldCheck}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!props.saving) props.onSave();
              }}
              required
              containerStyle={{ marginTop: anthraTheme.spacing.lg }}
            />

            <View
              style={{
                flexDirection: shouldStackActions ? "column" : "row",
                gap: anthraTheme.spacing.sm,
                marginTop: anthraTheme.spacing.md
              }}
            >
              <Button
                label={privacyState.secretVisible ? "Hide password" : "Show password"}
                icon={privacyState.secretVisible ? EyeOff : Eye}
                variant="outline"
                onPress={() => dispatchPrivacy({ type: "toggle-secret-visibility" })}
                accessibilityHint="Changes whether the password is displayed on screen"
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
              <Button
                label={privacyState.generating ? "Generating…" : "Generate strong"}
                icon={WandSparkles}
                variant="secondary"
                onPress={() => generateSecret().catch(() => undefined)}
                disabled={privacyState.generating}
                loading={privacyState.generating}
                accessibilityLabel="Generate a strong password"
                accessibilityHint="Replaces the password field with a randomly generated password"
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
            </View>

    </FormDialog>
  );
}
