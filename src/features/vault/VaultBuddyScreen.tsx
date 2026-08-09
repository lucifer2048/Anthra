import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, BackHandler, Keyboard, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";

import { PasswordManagerScreen } from "../../components/PasswordManagerScreen";
import { VaultEntryModal } from "../../components/VaultEntryModal";
import { VaultPinModal } from "../../components/VaultPinModal";
import { VaultResetPinModal } from "../../components/VaultResetPinModal";
import {
  deleteVaultEntry,
  getVaultEntries,
  getVaultSecuritySettings,
  saveVaultEntry,
  saveVaultPin,
  setVaultBiometricsEnabled as saveVaultBiometricsEnabled,
  verifyVaultPin
} from "../../db";
import type { VaultEntry } from "../../types";
import { generateStrongPassword } from "../../utils/passwords";
import { digitsOnly } from "../../utils/format";
import {
  getVaultPinAttemptStatus,
  INITIAL_VAULT_PIN_ATTEMPT_STATE,
  registerVaultPinFailure,
  registerVaultPinSuccess
} from "./pinAttemptPolicy";

type VaultFormState = {
  id?: number;
  appName: string;
  accountId: string;
  secret: string;
};

const INITIAL_VAULT_FORM: VaultFormState = {
  appName: "",
  accountId: "",
  secret: ""
};

export type VaultBuddyScreenProps = {
  onBack: () => void;
};

export function VaultBuddyScreen({ onBack }: VaultBuddyScreenProps) {
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [vaultEditorOpen, setVaultEditorOpen] = useState(false);
  const [vaultForm, setVaultForm] = useState<VaultFormState>(INITIAL_VAULT_FORM);
  const [vaultEditorError, setVaultEditorError] = useState("");
  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultHasPin, setVaultHasPin] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultNewPin, setVaultNewPin] = useState("");
  const [vaultConfirmPin, setVaultConfirmPin] = useState("");
  const [vaultResetPinOpen, setVaultResetPinOpen] = useState(false);
  const [vaultCurrentPin, setVaultCurrentPin] = useState("");
  const [vaultReplacementPin, setVaultReplacementPin] = useState("");
  const [vaultReplacementPinConfirm, setVaultReplacementPinConfirm] = useState("");
  const [vaultResetPinSaving, setVaultResetPinSaving] = useState(false);
  const [vaultResetPinError, setVaultResetPinError] = useState("");
  const [vaultBiometricsEnabled, setVaultBiometricsEnabled] = useState(false);
  const [revealedVaultIds, setRevealedVaultIds] = useState<number[]>([]);
  const [vaultNotice, setVaultNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"unlock" | "reveal" | "copy">("unlock");
  const [pinModalInput, setPinModalInput] = useState("");
  const [pinModalError, setPinModalError] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinModalTargetEntryId, setPinModalTargetEntryId] = useState<number | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const vaultPinAttemptRef = useRef(INITIAL_VAULT_PIN_ATTEMPT_STATE);
  const vaultClipboardValueRef = useRef<string | null>(null);
  const vaultClipboardClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pinVerificationRequestRef = useRef(0);
  const vaultBiometricActionInProgressRef = useRef(false);
  const vaultEntriesRef = useRef(vaultEntries);
  vaultEntriesRef.current = vaultEntries;
  const lockVaultRef = useRef<() => void>(() => undefined);

  const keyboardBottomPadding = keyboardHeight > 0 ? keyboardHeight + 16 : 24;

  const clearCopiedVaultPassword = useCallback(async () => {
    const copiedValue = vaultClipboardValueRef.current;
    vaultClipboardValueRef.current = null;
    if (vaultClipboardClearTimeoutRef.current) {
      clearTimeout(vaultClipboardClearTimeoutRef.current);
      vaultClipboardClearTimeoutRef.current = null;
    }
    if (!copiedValue) return;

    const currentValue = await Clipboard.getStringAsync().catch(() => "");
    if (currentValue === copiedValue) {
      await Clipboard.setStringAsync("").catch(() => undefined);
    }
  }, []);

  const cancelPinVerification = useCallback(() => {
    pinVerificationRequestRef.current += 1;
    setPinVerifying(false);
    setPinModalOpen(false);
  }, []);

  const clearRevealTimeout = useCallback((entryId: number) => {
    const existing = revealTimeoutsRef.current[entryId];
    if (existing) {
      clearTimeout(existing);
      delete revealTimeoutsRef.current[entryId];
    }
  }, []);

  const clearAllRevealTimeouts = useCallback(() => {
    Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
    revealTimeoutsRef.current = {};
  }, []);

  const lockVault = useCallback(() => {
    clearCopiedVaultPassword().catch(() => undefined);
    clearAllRevealTimeouts();
    setVaultUnlocked(false);
    setVaultEntries([]);
    setRevealedVaultIds([]);
    setVaultEditorOpen(false);
    setVaultForm(INITIAL_VAULT_FORM);
    setVaultEditorError("");
    setVaultSaving(false);
    cancelPinVerification();
    setPinModalError("");
    setPinModalInput("");
    setPinModalTargetEntryId(null);
    setVaultResetPinOpen(false);
    setVaultCurrentPin("");
    setVaultReplacementPin("");
    setVaultReplacementPinConfirm("");
    setVaultResetPinError("");
  }, [cancelPinVerification, clearAllRevealTimeouts, clearCopiedVaultPassword]);
  lockVaultRef.current = lockVault;

  const refreshVaultSecurity = useCallback(async () => {
    const security = await getVaultSecuritySettings();
    setVaultHasPin(security.hasPin);
    setVaultBiometricsEnabled(security.biometricsEnabled);
    return security;
  }, []);

  const refreshVaultEntries = useCallback(async () => {
    const items = await getVaultEntries();
    setVaultEntries(items);
    return items;
  }, []);

  const scheduleRevealAutoHide = useCallback(
    (entryId: number) => {
      clearRevealTimeout(entryId);
      revealTimeoutsRef.current[entryId] = setTimeout(() => {
        setRevealedVaultIds((prev) => prev.filter((id) => id !== entryId));
        clearRevealTimeout(entryId);
      }, 10_000);
    },
    [clearRevealTimeout]
  );

  const copyVaultPassword = useCallback(
    async (entryId: number) => {
      const entry = vaultEntriesRef.current.find((candidate) => candidate.id === entryId);
      if (!entry) {
        throw new Error("That password is no longer available.");
      }

      await clearCopiedVaultPassword();
      await Clipboard.setStringAsync(entry.secret);
      vaultClipboardValueRef.current = entry.secret;
      vaultClipboardClearTimeoutRef.current = setTimeout(() => {
        clearCopiedVaultPassword().catch(() => undefined);
      }, 30_000);
      setVaultNotice({ type: "success", message: "Password copied. Clipboard clears in 30 seconds." });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
    [clearCopiedVaultPassword]
  );

  const openPinModal = useCallback((mode: "unlock" | "reveal" | "copy", entryId: number | null = null) => {
    pinVerificationRequestRef.current += 1;
    const attemptStatus = getVaultPinAttemptStatus(vaultPinAttemptRef.current, Date.now());
    setPinModalMode(mode);
    setPinModalTargetEntryId(entryId);
    setPinModalInput("");
    setPinModalError(
      attemptStatus.canAttempt
        ? ""
        : `Too many incorrect attempts. Try again in ${attemptStatus.remainingWaitSeconds} seconds.`
    );
    setPinVerifying(false);
    setPinModalOpen(true);
  }, []);

  const closePinModal = useCallback(() => {
    cancelPinVerification();
    setPinModalInput("");
    setPinModalError("");
    setPinVerifying(false);
    setPinModalTargetEntryId(null);
  }, [cancelPinVerification]);

  const requestVaultSensitiveAction = useCallback(
    async (mode: "reveal" | "copy", entryId: number) => {
      if (vaultBiometricActionInProgressRef.current) return;
      if (!vaultBiometricsEnabled) {
        openPinModal(mode, entryId);
        return;
      }

      vaultBiometricActionInProgressRef.current = true;
      try {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync()
        ]);
        if (!hasHardware || !isEnrolled) {
          openPinModal(mode, entryId);
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: mode === "reveal" ? "Show password" : "Copy password",
          cancelLabel: "Use PIN",
          fallbackLabel: "Use PIN",
          disableDeviceFallback: true
        }).catch(() => null);

        if (!result?.success) {
          openPinModal(mode, entryId);
          return;
        }

        vaultPinAttemptRef.current = registerVaultPinSuccess();
        if (mode === "reveal") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        try {
          if (mode === "reveal") {
            setRevealedVaultIds((prev) => (prev.includes(entryId) ? prev : [...prev, entryId]));
            scheduleRevealAutoHide(entryId);
          } else {
            await copyVaultPassword(entryId);
          }
        } catch (error) {
          setVaultNotice({
            type: "error",
            message: error instanceof Error ? error.message : "Could not complete that password action."
          });
        }
      } catch {
        openPinModal(mode, entryId);
      } finally {
        vaultBiometricActionInProgressRef.current = false;
      }
    },
    [copyVaultPassword, openPinModal, scheduleRevealAutoHide, vaultBiometricsEnabled]
  );

  const verifyPinModal = useCallback(async () => {
    if (pinVerifying) return;
    const now = Date.now();
    const attemptStatus = getVaultPinAttemptStatus(vaultPinAttemptRef.current, now);
    if (!attemptStatus.canAttempt) {
      setPinModalError(
        `Too many incorrect attempts. Try again in ${attemptStatus.remainingWaitSeconds} seconds.`
      );
      return;
    }

    const requestId = ++pinVerificationRequestRef.current;
    const requestedMode = pinModalMode;
    const requestedEntryId = pinModalTargetEntryId;
    const requestedPin = pinModalInput;
    const requestIsCurrent = () => pinVerificationRequestRef.current === requestId;

    setPinVerifying(true);
    try {
      const valid = await verifyVaultPin(requestedPin);
      if (!requestIsCurrent()) return;
      if (!valid) {
        const nextAttemptState = registerVaultPinFailure(vaultPinAttemptRef.current, Date.now());
        vaultPinAttemptRef.current = nextAttemptState;
        const nextStatus = getVaultPinAttemptStatus(nextAttemptState, Date.now());
        setPinModalError(
          nextStatus.canAttempt
            ? "Incorrect PIN."
            : `Incorrect PIN. Try again in ${nextStatus.remainingWaitSeconds} seconds.`
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        return;
      }

      vaultPinAttemptRef.current = registerVaultPinSuccess();
      if (requestedMode !== "copy") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

      if (requestedMode === "unlock") {
        const entries = await getVaultEntries();
        if (!requestIsCurrent()) return;
        setVaultEntries(entries);
        setVaultUnlocked(true);
      } else if (requestedMode === "reveal" && requestedEntryId != null) {
        setRevealedVaultIds((prev) =>
          prev.includes(requestedEntryId) ? prev : [...prev, requestedEntryId]
        );
        scheduleRevealAutoHide(requestedEntryId);
      } else if (requestedMode === "copy" && requestedEntryId != null) {
        await copyVaultPassword(requestedEntryId);
        if (!requestIsCurrent()) {
          await clearCopiedVaultPassword();
          setVaultNotice(null);
          return;
        }
      }
      closePinModal();
    } catch (error) {
      if (!requestIsCurrent()) return;
      const message = error instanceof Error ? error.message : "Could not verify PIN.";
      setPinModalError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    } finally {
      if (requestIsCurrent()) setPinVerifying(false);
    }
  }, [
    clearCopiedVaultPassword,
    closePinModal,
    copyVaultPassword,
    pinModalInput,
    pinModalMode,
    pinModalTargetEntryId,
    pinVerifying,
    scheduleRevealAutoHide
  ]);

  const handleSetupVaultPin = async () => {
    try {
      const pin = digitsOnly(vaultNewPin);
      const confirmPin = digitsOnly(vaultConfirmPin);
      if (pin.length < 4 || pin.length > 8) {
        setVaultNotice({ type: "error", message: "PIN must be 4 to 8 digits." });
        return;
      }
      if (pin !== confirmPin) {
        setVaultNotice({ type: "error", message: "PINs do not match." });
        return;
      }
      await saveVaultPin(pin);
      vaultPinAttemptRef.current = registerVaultPinSuccess();
      setVaultNewPin("");
      setVaultConfirmPin("");
      await refreshVaultSecurity();
      setVaultNotice({ type: "success", message: "PIN setup complete." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save PIN.";
      setVaultNotice({ type: "error", message });
    }
  };

  const handleToggleVaultBiometrics = async () => {
    try {
      const enabling = !vaultBiometricsEnabled;
      if (enabling) {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync()
        ]);
        if (!hasHardware || !isEnrolled) {
          setVaultNotice({
            type: "error",
            message: "Set up fingerprint or face unlock in your device settings first."
          });
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Enable biometric unlock",
          cancelLabel: "Cancel",
          disableDeviceFallback: true
        });
        if (!result.success) {
          setVaultNotice({ type: "error", message: "Biometric unlock was not enabled." });
          return;
        }
      }

      await saveVaultBiometricsEnabled(enabling);
      await refreshVaultSecurity();
      setVaultNotice({
        type: "success",
        message: enabling ? "Biometric unlock enabled." : "Biometric unlock disabled."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update biometric setting.";
      setVaultNotice({ type: "error", message });
    }
  };

  const openVaultResetPin = () => {
    if (!vaultHasPin || !vaultUnlocked) return;
    setVaultCurrentPin("");
    setVaultReplacementPin("");
    setVaultReplacementPinConfirm("");
    setVaultResetPinError("");
    setVaultResetPinOpen(true);
  };

  const closeVaultResetPin = () => {
    if (vaultResetPinSaving) return;
    setVaultResetPinOpen(false);
    setVaultCurrentPin("");
    setVaultReplacementPin("");
    setVaultReplacementPinConfirm("");
    setVaultResetPinError("");
  };

  const handleResetVaultPin = async () => {
    if (vaultResetPinSaving || !vaultHasPin || !vaultUnlocked) return;

    const currentPin = digitsOnly(vaultCurrentPin);
    const nextPin = digitsOnly(vaultReplacementPin);
    const confirmPin = digitsOnly(vaultReplacementPinConfirm);

    if (currentPin.length < 4 || currentPin.length > 8) {
      setVaultResetPinError("Enter your current 4 to 8 digit PIN.");
      return;
    }
    if (nextPin.length < 4 || nextPin.length > 8) {
      setVaultResetPinError("New PIN must be 4 to 8 digits.");
      return;
    }
    if (nextPin !== confirmPin) {
      setVaultResetPinError("New PINs do not match.");
      return;
    }
    if (nextPin === currentPin) {
      setVaultResetPinError("Choose a new PIN that is different from your current PIN.");
      return;
    }

    setVaultResetPinSaving(true);
    setVaultResetPinError("");
    try {
      await saveVaultPin(nextPin, currentPin);
      vaultPinAttemptRef.current = registerVaultPinSuccess();
      setVaultResetPinOpen(false);
      setVaultCurrentPin("");
      setVaultReplacementPin("");
      setVaultReplacementPinConfirm("");
      clearAllRevealTimeouts();
      setVaultEntries([]);
      setRevealedVaultIds([]);
      setVaultUnlocked(false);
      setVaultNotice({ type: "success", message: "Vault PIN reset. Unlock again with your new PIN." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reset vault PIN.";
      setVaultResetPinError(message);
    } finally {
      setVaultResetPinSaving(false);
    }
  };

  const openVaultEditor = (entry?: VaultEntry) => {
    setVaultEditorError("");
    setVaultSaving(false);
    if (!entry) {
      setVaultForm(INITIAL_VAULT_FORM);
      setVaultEditorOpen(true);
      return;
    }
    setVaultForm({
      id: entry.id,
      appName: entry.appName,
      accountId: entry.accountId,
      secret: entry.secret
    });
    setVaultEditorOpen(true);
  };

  const handleSaveVault = async () => {
    if (vaultSaving) return;
    setVaultSaving(true);
    setVaultEditorError("");
    try {
      await saveVaultEntry(vaultForm);
      await refreshVaultEntries();
      setVaultEditorOpen(false);
      setVaultForm(INITIAL_VAULT_FORM);
      setVaultNotice({ type: "success", message: "Password saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save password.";
      setVaultEditorError(message);
    } finally {
      setVaultSaving(false);
    }
  };

  const handleDeleteVault = (entry: VaultEntry) => {
    Alert.alert("Delete password", `Delete credentials for ${entry.appName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            clearRevealTimeout(entry.id);
            await deleteVaultEntry(entry.id);
            await refreshVaultEntries();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not delete password.";
            setVaultNotice({ type: "error", message });
          }
        }
      }
    ]);
  };

  const handleToggleShowPassword = (entryId: number, currentlyVisible: boolean) => {
    if (currentlyVisible) {
      clearRevealTimeout(entryId);
      setRevealedVaultIds((prev) => prev.filter((id) => id !== entryId));
      return;
    }
    requestVaultSensitiveAction("reveal", entryId).catch(() => undefined);
  };

  const handleBack = useCallback(() => {
    lockVault();
    onBack();
  }, [lockVault, onBack]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const security = await refreshVaultSecurity();
      if (cancelled) return;

      if (!security.hasPin) {
        setVaultUnlocked(false);
        return;
      }

      if (security.biometricsEnabled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Password Buddy",
          cancelLabel: "Use PIN",
          fallbackLabel: "Use PIN",
          disableDeviceFallback: true
        }).catch(() => null);
        if (cancelled) return;
        if (result?.success) {
          vaultPinAttemptRef.current = registerVaultPinSuccess();
          await refreshVaultEntries();
          if (cancelled) return;
          setVaultUnlocked(true);
          return;
        }
      }

      if (!cancelled) openPinModal("unlock");
    })().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [openPinModal, refreshVaultEntries, refreshVaultSecurity]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!vaultNotice) return;
    const timeout = setTimeout(() => {
      setVaultNotice(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [vaultNotice]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        lockVault();
      }
    });
    return () => appStateSubscription.remove();
  }, [lockVault]);

  useEffect(() => {
    return () => {
      lockVaultRef.current();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      if (vaultResetPinOpen) {
        closeVaultResetPin();
        return true;
      }
      if (vaultEditorOpen) {
        setVaultEditorOpen(false);
        setVaultForm(INITIAL_VAULT_FORM);
        setVaultEditorError("");
        setVaultSaving(false);
        return true;
      }
      if (pinModalOpen) {
        if (!pinVerifying) closePinModal();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [
    closePinModal,
    keyboardHeight,
    pinModalOpen,
    pinVerifying,
    vaultEditorOpen,
    vaultResetPinOpen,
    vaultResetPinSaving
  ]);

  return (
    <>
      <PasswordManagerScreen
        keyboardBottomPadding={keyboardBottomPadding}
        hasPin={vaultHasPin}
        unlocked={vaultUnlocked}
        newPin={vaultNewPin}
        confirmPin={vaultConfirmPin}
        biometricsEnabled={vaultBiometricsEnabled}
        entries={vaultEntries}
        revealedEntryIds={revealedVaultIds}
        notice={vaultNotice}
        onBack={handleBack}
        onChangeNewPin={(value) => setVaultNewPin(digitsOnly(value))}
        onChangeConfirmPin={(value) => setVaultConfirmPin(digitsOnly(value))}
        onSetupPin={() => handleSetupVaultPin().catch(() => undefined)}
        onUnlock={() => openPinModal("unlock")}
        onToggleBiometrics={() => handleToggleVaultBiometrics().catch(() => undefined)}
        onResetPin={openVaultResetPin}
        onAddEntry={() => openVaultEditor()}
        onEditEntry={openVaultEditor}
        onDeleteEntry={handleDeleteVault}
        onToggleEntryVisibility={handleToggleShowPassword}
        onCopyEntryPassword={(entryId) =>
          requestVaultSensitiveAction("copy", entryId).catch(() => undefined)
        }
      />

      <VaultEntryModal
        visible={vaultEditorOpen}
        editing={vaultForm.id != null}
        appName={vaultForm.appName}
        accountId={vaultForm.accountId}
        secret={vaultForm.secret}
        error={vaultEditorError}
        saving={vaultSaving}
        onChangeAppName={(value) => {
          setVaultForm((prev) => ({ ...prev, appName: value }));
          if (vaultEditorError) setVaultEditorError("");
        }}
        onChangeAccountId={(value) => {
          setVaultForm((prev) => ({ ...prev, accountId: value }));
          if (vaultEditorError) setVaultEditorError("");
        }}
        onChangeSecret={(value) => {
          setVaultForm((prev) => ({ ...prev, secret: value }));
          if (vaultEditorError) setVaultEditorError("");
        }}
        onGenerateSecret={async () => {
          const secret = await generateStrongPassword();
          setVaultForm((prev) => ({ ...prev, secret }));
        }}
        onClose={() => {
          setVaultEditorOpen(false);
          setVaultForm(INITIAL_VAULT_FORM);
          setVaultEditorError("");
          setVaultSaving(false);
        }}
        onSave={() => handleSaveVault().catch(() => undefined)}
      />

      <VaultResetPinModal
        visible={vaultResetPinOpen && vaultHasPin && vaultUnlocked}
        currentPin={vaultCurrentPin}
        newPin={vaultReplacementPin}
        confirmPin={vaultReplacementPinConfirm}
        saving={vaultResetPinSaving}
        error={vaultResetPinError}
        onChangeCurrentPin={(value) => {
          setVaultCurrentPin(digitsOnly(value));
          if (vaultResetPinError) setVaultResetPinError("");
        }}
        onChangeNewPin={(value) => {
          setVaultReplacementPin(digitsOnly(value));
          if (vaultResetPinError) setVaultResetPinError("");
        }}
        onChangeConfirmPin={(value) => {
          setVaultReplacementPinConfirm(digitsOnly(value));
          if (vaultResetPinError) setVaultResetPinError("");
        }}
        onClose={closeVaultResetPin}
        onSubmit={() => handleResetVaultPin().catch(() => undefined)}
      />

      <VaultPinModal
        visible={pinModalOpen}
        mode={pinModalMode}
        pin={pinModalInput}
        error={pinModalError}
        verifying={pinVerifying}
        onChangePin={(value) => {
          setPinModalInput(digitsOnly(value));
          if (pinModalError) setPinModalError("");
        }}
        onClose={closePinModal}
        onVerify={() => verifyPinModal().catch(() => undefined)}
      />
    </>
  );
}
