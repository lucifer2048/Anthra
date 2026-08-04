import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  Share,
  Text,
  ToastAndroid,
  useColorScheme as useSystemColorScheme,
  View
} from "react-native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { Star } from "lucide-react-native";

import "./global.css";
import "./src/utils/reminderNotificationTask";
import { PasswordManagerScreen } from "./src/components/PasswordManagerScreen";
import { TimerScreen } from "./src/components/TimerScreen";
import { ListBuddyScreen } from "./src/components/ListBuddyScreen";
import { AlarmBuddyScreen } from "./src/components/AlarmBuddyScreen";
import { LaunchOverlay } from "./src/components/LaunchOverlay";
import { VaultResetPinModal } from "./src/components/VaultResetPinModal";
import { VaultEntryModal } from "./src/components/VaultEntryModal";
import { VaultPinModal } from "./src/components/VaultPinModal";
import { type WorkoutTab } from "./src/components/WorkoutTabBar";
import type { ReminderTab } from "./src/components/ReminderTabBar";
import { ScreenLayout } from "./src/components/layout";
import { ActivityBuddyScreen } from "./src/features/activity/ActivityBuddyScreen";
import { AnthraHomeScreen } from "./src/features/hub/AnthraHomeScreen";
import { TrackerBuddyScreen } from "./src/features/tracker/TrackerBuddyScreen";
import { ReminderBuddyScreen } from "./src/features/reminder/ReminderBuddyScreen";
import { WorkoutBuddyScreen } from "./src/features/workout/WorkoutBuddyScreen";
import { syncTrackerNotifications } from "./src/features/tracker/trackerNotifications";
import { AppProviders } from "./src/providers";
import { createScreenBackgrounds, resolveTheme, themes, type ThemeMode } from "./src/design-system";
import { Button, KeyboardAwareScrollView, TextField } from "./src/components/ui";
import {
  clearActiveWorkoutSnapshot,
  createAnthraBackup,
  deletePlan,
  deleteWorkoutSession,
  deleteVaultEntry,
  finalizeWorkoutSession,
  getActiveWorkoutSnapshot,
  getAppThemeMode,
  getAlarmItems,
  getDashboardStats,
  getPlans,
  getReminderCompletionEntries,
  getReminderItems,
  getUserProfile,
  getUserSettings,
  getVaultEntries,
  getVaultSecuritySettings,
  getWorkoutHistory,
  initDatabase,
  logWorkoutCompletion,
  markReminderOccurrenceDone,
  saveActiveWorkoutSnapshot,
  saveAppThemeMode,
  savePlan,
  saveVaultEntry,
  saveVaultPin,
  saveWorkoutSessionFeedback,
  setVaultBiometricsEnabled as saveVaultBiometricsEnabled,
  saveUserProfile,
  saveUserSettings,
  startWorkoutSession,
  restoreAnthraBackup,
  verifyVaultPin
} from "./src/db";
import { normalizeDays } from "./src/constants/schedule";
import type {
  ActiveWorkoutSnapshot,
  DashboardStats,
  UserProfile,
  UserSettings,
  VaultEntry,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput,
  WorkoutRunSummary,
  WorkoutTimerState
} from "./src/types";
import { syncWorkoutReminderDelivery } from "./src/utils/reminders";
import { syncReminderBuddyNotifications, setupNotificationResponseListener } from "./src/utils/reminderBuddy";
import {
  getDayPartsInTimeZone,
  getDeviceTimeZone
} from "./src/utils/timezone";
import { generateStrongPassword } from "./src/utils/passwords";
import {
  getAlarmPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  replaceNativeAlarms,
  syncWorkoutAlarmReminders
} from "./src/utils/alarmNative";
import {
  createPlanShareFileContents,
  createPlanShareMessage,
  isPlanShareUrl,
  parsePlanShareText,
  parsePlanShareUrl
} from "./src/utils/planSharing";
import { getPlansForWeekday, getScheduledWorkoutDays } from "./src/utils/workoutSchedule";
import {
  getVaultPinAttemptStatus,
  INITIAL_VAULT_PIN_ATTEMPT_STATE,
  registerVaultPinFailure,
  registerVaultPinSuccess
} from "./src/features/vault/pinAttemptPolicy";

type AppModule = "hub" | "workout" | "reminder" | "password" | "list" | "alarm" | "activity" | "tracker";

type ModuleTheme = {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  icon: string;
  onAccent: string;
};


type VaultFormState = {
  id?: number;
  appName: string;
  accountId: string;
  secret: string;
};

const INITIAL_STATS: DashboardStats = {
  currentStreak: 0,
  bestStreak: 0,
  streakWeeks: 0,
  totalWorkouts: 0,
  averageWorkoutSeconds: 0,
  weekCompleted: 0,
  weekGoal: 4
};

const INITIAL_SETTINGS: UserSettings = {
  workoutDays: [1, 3, 5],
  weeklyGoal: 4,
  reminderHour: 18,
  reminderMinute: 0,
  reminderLeadMinutes: [60],
  notificationsEnabled: false,
  reminderDelivery: "notification",
  timezone: getDeviceTimeZone()
};


const INITIAL_VAULT_FORM: VaultFormState = {
  appName: "",
  accountId: "",
  secret: ""
};

function withAlpha(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) return hex;
  const parsed = Number.parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function resolveModuleTheme(isDarkMode: boolean): ModuleTheme {
  const colors = isDarkMode ? themes.dark.colors : themes.light.colors;
  return {
    accent: colors.brand,
    accentSoft: colors.brandSoft,
    accentBorder: colors.brandBorder,
    icon: colors.brand,
    onAccent: colors.textOnBrandSolid
  };
}

function parsePositiveNumber(input: string): number | null {
  const sanitized = input.replace(/[^0-9.]/g, "");
  if (!sanitized) return null;
  const value = Number(sanitized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10) / 10;
}

function formatMetricValue(value: number | null): string {
  if (value == null) return "";
  return Number.isInteger(value) ? String(value) : String(value);
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function parseStrictWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function normalizeReminderLeadMinutes(values: number[]): number[] {
  const normalized = values
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));
  const deduped = Array.from(new Set(normalized));
  deduped.sort((a, b) => b - a);
  return deduped.slice(0, 3);
}

function ensureThreeLeadInputs(values: number[]): string[] {
  const normalized = normalizeReminderLeadMinutes(values);
  return [
    String(normalized[0] ?? 60),
    String(normalized[1] ?? 30),
    String(normalized[2] ?? 15)
  ];
}

export default function App() {
  const systemColorScheme = useSystemColorScheme();
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<WorkoutTab>("home");
  const [planListMode, setPlanListMode] = useState<"all" | "today">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeTimerInitialState, setActiveTimerInitialState] = useState<WorkoutTimerState | null>(null);
  const [recoverableWorkout, setRecoverableWorkout] = useState<ActiveWorkoutSnapshot | null>(null);
  const [profileHeightCm, setProfileHeightCm] = useState("");
  const [profileWeightKg, setProfileWeightKg] = useState("");
  const [profileGoal, setProfileGoal] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [weeklyGoalText, setWeeklyGoalText] = useState(String(INITIAL_SETTINGS.weeklyGoal));
  const [reminderHourText, setReminderHourText] = useState(String(INITIAL_SETTINGS.reminderHour));
  const [reminderMinuteText, setReminderMinuteText] = useState(String(INITIAL_SETTINGS.reminderMinute));
  const [reminderCount, setReminderCount] = useState(1);
  const [reminderLeadTexts, setReminderLeadTexts] = useState<string[]>(
    ensureThreeLeadInputs(INITIAL_SETTINGS.reminderLeadMinutes)
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSessionId, setFeedbackSessionId] = useState<number | null>(null);
  const [feedbackPlanName, setFeedbackPlanName] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackNoteModalOpen, setFeedbackNoteModalOpen] = useState(false);
  const [workoutCompletionTransition, setWorkoutCompletionTransition] = useState(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const [activeModule, setActiveModule] = useState<AppModule>("hub");
  const [enabledReminderCount, setEnabledReminderCount] = useState(0);
  const [reminderInitialTab, setReminderInitialTab] = useState<ReminderTab | undefined>(undefined);
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
  const vaultPinAttemptRef = useRef(INITIAL_VAULT_PIN_ATTEMPT_STATE);
  const vaultClipboardValueRef = useRef<string | null>(null);
  const vaultClipboardClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pinVerificationRequestRef = useRef(0);
  const vaultBiometricActionInProgressRef = useRef(false);
  const completionLoggedRef = useRef(false);
  const lastBackPressRef = useRef(0);
  const notificationSyncInProgressRef = useRef(false);
  const lastNotificationSyncRef = useRef(0);
  const workoutAlarmPermissionSetupRef = useRef(false);
  const workoutAlarmPermissionPromptVisibleRef = useRef(false);
  const pendingReminderHistoryNavigationRef = useRef(false);
  const workoutFlowBusyRef = useRef(false);
  const workoutSnapshotSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledPlanShareUrlsRef = useRef(new Set<string>());
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleThemeModeChange = useCallback((nextMode: ThemeMode) => {
    setThemeMode(nextMode);
    saveAppThemeMode(nextMode).catch(() => undefined);
  }, []);

  const promptForWorkoutAlarmPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return false;
    const status = await getAlarmPermissionStatus();
    if (!status.nativeSupported) return false;

    const missingPermission = !status.exactAlarm
      ? {
          title: "Allow alarms & reminders",
          message: "Android requires this system permission for Anthra to ring workout alarms at the exact reminder time.",
          open: openExactAlarmSettings
        }
      : !status.fullScreenIntent
        ? {
            title: "Allow full-screen alarms",
            message: "Allow Anthra to open workout alarms full-screen, including while your phone is locked.",
            open: openFullScreenIntentSettings
          }
        : null;

    if (!missingPermission) {
      workoutAlarmPermissionSetupRef.current = false;
      return true;
    }
    if (workoutAlarmPermissionPromptVisibleRef.current) return false;

    workoutAlarmPermissionPromptVisibleRef.current = true;
    Alert.alert(
      missingPermission.title,
      missingPermission.message,
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            workoutAlarmPermissionPromptVisibleRef.current = false;
            workoutAlarmPermissionSetupRef.current = false;
          }
        },
        {
          text: "Open settings",
          onPress: () => {
            workoutAlarmPermissionPromptVisibleRef.current = false;
            workoutAlarmPermissionSetupRef.current = true;
            missingPermission.open().catch((error) => {
              workoutAlarmPermissionSetupRef.current = false;
              Alert.alert(
                "Could not open settings",
                error instanceof Error ? error.message : "Open Android settings and allow alarm access for Anthra."
              );
            });
          }
        }
      ],
      {
        cancelable: true,
        onDismiss: () => {
          workoutAlarmPermissionPromptVisibleRef.current = false;
        }
      }
    );
    return false;
  }, []);

  workoutFlowBusyRef.current = Boolean(
    activePlan || feedbackOpen || feedbackNoteModalOpen || workoutCompletionTransition
  );

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

  const refreshDashboard = useCallback(async () => {
    const latestStats = await getDashboardStats();
    setStats(latestStats);
  }, []);

  const refreshHistory = useCallback(async () => {
    const latestHistory = await getWorkoutHistory();
    setHistory(latestHistory);
  }, []);

  const refreshData = useCallback(async () => {
    const [latestPlans, latestStats, latestHistory] = await Promise.all([
      getPlans(),
      getDashboardStats(),
      getWorkoutHistory()
    ]);
    setPlans(latestPlans);
    setStats(latestStats);
    setHistory(latestHistory);
    return { plans: latestPlans, stats: latestStats, history: latestHistory };
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await getUserProfile();
    setProfileHeightCm(formatMetricValue(profile.heightCm));
    setProfileWeightKg(formatMetricValue(profile.weightKg));
    setProfileGoal(profile.goal);
  }, []);

  const refreshSettings = useCallback(async (): Promise<UserSettings> => {
    const nextSettings = await getUserSettings();
    setSettings(nextSettings);
    setWeeklyGoalText(String(nextSettings.weeklyGoal));
    setReminderHourText(String(nextSettings.reminderHour));
    setReminderMinuteText(String(nextSettings.reminderMinute));
    const leadInputs = ensureThreeLeadInputs(nextSettings.reminderLeadMinutes);
    const normalizedCount = Math.min(
      3,
      Math.max(1, normalizeReminderLeadMinutes(nextSettings.reminderLeadMinutes).length)
    );
    setReminderLeadTexts(leadInputs);
    setReminderCount(normalizedCount);
    return nextSettings;
  }, []);

  const refreshEnabledReminderCount = useCallback(async () => {
    const items = await getReminderItems();
    setEnabledReminderCount(items.filter((item) => item.enabled).length);
    return items;
  }, []);

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

  const syncAllNotifications = useCallback(
    async (
      nextSettings: UserSettings,
      nextPlans: WorkoutPlan[],
      force = false
    ) => {
      if (notificationSyncInProgressRef.current) return false;
      if (!force && Date.now() - lastNotificationSyncRef.current < 15 * 60_000) return false;

      notificationSyncInProgressRef.current = true;
      try {
        const [nextReminders, nextCompletions] = await Promise.all([
          getReminderItems(),
          getReminderCompletionEntries()
        ]);
        await Promise.all([
          syncWorkoutReminderDelivery(
            nextSettings,
            getScheduledWorkoutDays(nextPlans, nextSettings.workoutDays)
          ),
          syncReminderBuddyNotifications(nextReminders, nextCompletions),
          syncTrackerNotifications()
        ]);
        lastNotificationSyncRef.current = Date.now();
        return true;
      } finally {
        notificationSyncInProgressRef.current = false;
      }
    },
    []
  );

  const bootstrap = useCallback(async () => {
    await initDatabase();
    const [nextData, , nextSettings, , , recoveredWorkout, storedThemeMode] = await Promise.all([
      refreshData(),
      refreshProfile(),
      refreshSettings(),
      refreshEnabledReminderCount(),
      refreshVaultSecurity(),
      getActiveWorkoutSnapshot(),
      getAppThemeMode()
    ]);
    setRecoverableWorkout(recoveredWorkout);
    setThemeMode(storedThemeMode);
    setReady(true);
    setTimeout(() => {
      syncAllNotifications(nextSettings, nextData.plans, true).catch(() => undefined);
    }, 250);
  }, [refreshData, refreshEnabledReminderCount, refreshProfile, refreshSettings, refreshVaultSecurity, syncAllNotifications]);

  useEffect(() => {
    let cancelled = false;
    setBootstrapError(null);
    bootstrap().catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : "Failed to start app.";
      setBootstrapError(message);
      setShowSplashOverlay(false);
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrap, bootstrapAttempt]);

  useEffect(() => {
    if (!ready) return;
    let cleanup: (() => void) | undefined;
    setupNotificationResponseListener(
      async (reminderId, occurrenceTs) => {
        try {
          await markReminderOccurrenceDone(reminderId, occurrenceTs);
        } catch {
          // Silently ignore - the user can still mark it done in the app.
        }
      },
      () => {
        if (workoutFlowBusyRef.current) {
          pendingReminderHistoryNavigationRef.current = true;
          return;
        }
        setReminderInitialTab("history");
        setActiveModule("reminder");
      }
    ).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [ready]);

  useEffect(() => {
    if (activePlan || feedbackOpen || feedbackNoteModalOpen || workoutCompletionTransition) return;
    if (!pendingReminderHistoryNavigationRef.current) return;
    pendingReminderHistoryNavigationRef.current = false;
    setReminderInitialTab("history");
    setActiveModule("reminder");
  }, [activePlan, feedbackNoteModalOpen, feedbackOpen, workoutCompletionTransition]);

  useEffect(() => {
    if (!ready || !showSplashOverlay) return;
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true
    }).start(() => {
      setShowSplashOverlay(false);
    });
  }, [ready, showSplashOverlay, splashOpacity]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      refreshDashboard().catch(() => undefined);
      refreshHistory().catch(() => undefined);
      refreshEnabledReminderCount().catch(() => undefined);
    }, 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        Promise.all([refreshData(), refreshSettings(), refreshEnabledReminderCount()])
          .then(async ([nextData, nextSettings]) => {
            const shouldRetryWorkoutAlarm =
              nextSettings.notificationsEnabled &&
              (nextSettings.reminderDelivery === "alarm" || nextSettings.reminderDelivery === "both");
            if (workoutAlarmPermissionSetupRef.current && shouldRetryWorkoutAlarm) {
              await promptForWorkoutAlarmPermission();
            }
            const syncedEverything = await syncAllNotifications(
              nextSettings,
              nextData.plans
            );
            if (!syncedEverything && shouldRetryWorkoutAlarm) {
              await syncWorkoutAlarmReminders(
                nextSettings,
                getScheduledWorkoutDays(nextData.plans, nextSettings.workoutDays)
              );
            }
          })
          .catch(() => undefined);
      } else {
        clearCopiedVaultPassword().catch(() => undefined);
        Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
        revealTimeoutsRef.current = {};
        setVaultUnlocked(false);
        setVaultEntries([]);
        setRevealedVaultIds([]);
        setVaultEditorOpen(false);
        setVaultForm(INITIAL_VAULT_FORM);
        setVaultEditorError("");
        setVaultSaving(false);
        setVaultResetPinOpen(false);
        cancelPinVerification();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [cancelPinVerification, clearCopiedVaultPassword, promptForWorkoutAlarmPermission, ready, refreshDashboard, refreshData, refreshEnabledReminderCount, refreshHistory, refreshSettings, syncAllNotifications]);

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
    if (!profileNotice) return;
    const timeout = setTimeout(() => {
      setProfileNotice(null);
    }, 2500);
    return () => clearTimeout(timeout);
  }, [profileNotice]);

  useEffect(() => {
    if (!settingsNotice) return;
    const timeout = setTimeout(() => {
      setSettingsNotice(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [settingsNotice]);

  useEffect(() => {
    if (!vaultNotice) return;
    const timeout = setTimeout(() => {
      setVaultNotice(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [vaultNotice]);

  useEffect(() => {
    if (activeModule === "password") return;
    clearCopiedVaultPassword().catch(() => undefined);
    Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
    revealTimeoutsRef.current = {};
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
  }, [activeModule, cancelPinVerification, clearCopiedVaultPassword]);

  useEffect(() => {
    return () => {
      clearCopiedVaultPassword().catch(() => undefined);
      Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
      if (workoutSnapshotSaveRef.current) clearTimeout(workoutSnapshotSaveRef.current);
    };
  }, [clearCopiedVaultPassword]);

  const openCreatePlan = () => {
    setEditingPlan(null);
    setEditorOpen(true);
  };

  const openEditPlan = (plan: WorkoutPlan) => {
    setEditingPlan(plan);
    setEditorOpen(true);
  };

  const handleSavePlan = async (plan: WorkoutPlanInput): Promise<boolean> => {
    if (!plan.name.trim()) {
      Alert.alert("Missing name", "Give this plan a name before saving.");
      return false;
    }
    if (plan.sections.length === 0) {
      Alert.alert("Add a set", "Your plan needs at least one set.");
      return false;
    }
    if (plan.sections.some((section) => section.exercises.length === 0)) {
      Alert.alert("Check sets", "Every set needs at least one exercise.");
      return false;
    }
    if (plan.sections.some((section) => section.exercises.some((exercise) => !exercise.name.trim()))) {
      Alert.alert("Check exercises", "Every exercise needs a name.");
      return false;
    }

    await savePlan(plan);
    setEditorOpen(false);
    setEditingPlan(null);
    const nextData = await refreshData();
    await syncWorkoutReminderDelivery(
      settings,
      getScheduledWorkoutDays(nextData.plans, settings.workoutDays)
    ).catch(() => undefined);
    return true;
  };

  const handleDeletePlan = (plan: WorkoutPlan) => {
    Alert.alert("Delete plan", `Delete "${plan.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deletePlan(plan.id);
          const nextData = await refreshData();
          await syncWorkoutReminderDelivery(
            settings,
            getScheduledWorkoutDays(nextData.plans, settings.workoutDays)
          ).catch(() => undefined);
        }
      }
    ]);
  };

  const previewSharedPlan = useCallback(
    (sharedPlan: WorkoutPlanInput) => {
      const exerciseCount = sharedPlan.sections.reduce(
        (total, section) => total + section.exercises.length,
        0
      );
      Alert.alert(
        "Add to My Plans?",
        `“${sharedPlan.name}” has ${sharedPlan.sections.length} set(s) and ${exerciseCount} exercise(s).`,
        [
          { text: "Not Now", style: "cancel" },
          {
            text: "Add to My Plans",
            onPress: () => {
              void (async () => {
                try {
                  await savePlan(sharedPlan);
                  const nextData = await refreshData();
                  await syncWorkoutReminderDelivery(
                    settings,
                    getScheduledWorkoutDays(nextData.plans, settings.workoutDays)
                  ).catch(() => undefined);
                  setActiveModule("workout");
                  setPlanListMode("all");
                  setActiveTab("plans");
                  setShowSplashOverlay(false);
                  if (Platform.OS === "android") {
                    ToastAndroid.show(`Added ${sharedPlan.name} to your plans`, ToastAndroid.SHORT);
                  } else {
                    Alert.alert("Plan added", `“${sharedPlan.name}” is now in your plans.`);
                  }
                } catch (error) {
                  const message = error instanceof Error ? error.message : "The plan could not be saved.";
                  Alert.alert("Could not add plan", message);
                }
              })();
            }
          }
        ]
      );
    },
    [refreshData, settings]
  );

  const handleSharePlan = async (plan: WorkoutPlan) => {
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        await Share.share(
          { message: createPlanShareMessage(plan), title: `Share ${plan.name}` },
          { dialogTitle: `Share ${plan.name}` }
        );
        return;
      }

      const fileStem = plan.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "workout";
      const uri = `${FileSystem.cacheDirectory}anthra-plan-${fileStem}.json`;
      await FileSystem.writeAsStringAsync(uri, createPlanShareFileContents(plan), {
        encoding: FileSystem.EncodingType.UTF8
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: `Share ${plan.name}`,
        UTI: "public.json"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This plan could not be shared.";
      Alert.alert("Could not share plan", message);
    }
  };

  const previewSharedPlanText = useCallback(
    (text: string) => {
      const sharedPlan = parsePlanShareText(text);
      if (!sharedPlan) {
        Alert.alert("Invalid shared plan", "Choose an Anthra plan file or copy a complete Anthra plan link.");
        return;
      }
      previewSharedPlan(sharedPlan);
    },
    [previewSharedPlan]
  );

  const handleImportPlanFile = useCallback(async () => {
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false
      });
      if (selection.canceled || !selection.assets[0]) return;
      const raw = await FileSystem.readAsStringAsync(selection.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (raw.length > 1_000_000) throw new Error("This plan file is too large to import safely.");
      previewSharedPlanText(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "This plan file could not be read.";
      Alert.alert("Could not import plan", message);
    }
  }, [previewSharedPlanText]);

  const handleImportPlan = useCallback(() => {
    Alert.alert(
      "Import a plan",
      "Choose a shared Anthra plan file, or paste a plan link copied from a message.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Paste shared link",
          onPress: () => {
            Clipboard.getStringAsync()
              .then(previewSharedPlanText)
              .catch(() => Alert.alert("Clipboard unavailable", "Anthra could not read the clipboard."));
          }
        },
        {
          text: "Choose file",
          onPress: () => handleImportPlanFile().catch(() => undefined)
        }
      ]
    );
  }, [handleImportPlanFile, previewSharedPlanText]);

  const handleIncomingPlanUrl = useCallback(
    (url: string) => {
      if (!isPlanShareUrl(url) || handledPlanShareUrlsRef.current.has(url)) return;
      handledPlanShareUrlsRef.current.add(url);

      const sharedPlan = parsePlanShareUrl(url);
      if (!sharedPlan) {
        Alert.alert("Invalid shared plan", "This Anthra plan link is incomplete or no longer supported.");
        return;
      }
      previewSharedPlan(sharedPlan);
    },
    [previewSharedPlan]
  );

  useEffect(() => {
    if (!ready) return;

    Linking.getInitialURL()
      .then((url) => {
        if (url) handleIncomingPlanUrl(url);
      })
      .catch(() => undefined);

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleIncomingPlanUrl(url);
    });
    return () => subscription.remove();
  }, [handleIncomingPlanUrl, ready]);

  const handleDeleteHistoryEntry = (entry: WorkoutHistoryEntry) => {
    Alert.alert("Delete history", `Remove "${entry.planName}" from workout history?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteWorkoutSession(entry.id);
          await refreshHistory();
        }
      }
    ]);
  };

  const clearWorkoutRecovery = useCallback(async () => {
    if (workoutSnapshotSaveRef.current) {
      clearTimeout(workoutSnapshotSaveRef.current);
      workoutSnapshotSaveRef.current = null;
    }
    await clearActiveWorkoutSnapshot();
    setRecoverableWorkout(null);
  }, []);

  const handleTimerStateChange = useCallback(
    (timer: WorkoutTimerState) => {
      if (!activePlan || !activeSessionId) return;
      if (workoutSnapshotSaveRef.current) {
        clearTimeout(workoutSnapshotSaveRef.current);
      }

      const snapshot: ActiveWorkoutSnapshot = {
        sessionId: activeSessionId,
        plan: activePlan,
        timer,
        updatedAt: Date.now()
      };
      workoutSnapshotSaveRef.current = setTimeout(() => {
        workoutSnapshotSaveRef.current = null;
        saveActiveWorkoutSnapshot(snapshot).catch(() => undefined);
      }, 500);
    },
    [activePlan, activeSessionId]
  );

  const resumeInterruptedWorkout = useCallback(() => {
    if (!recoverableWorkout) return;
    completionLoggedRef.current = false;
    setActiveTimerInitialState({ ...recoverableWorkout.timer, isRunning: false });
    setActiveSessionId(recoverableWorkout.sessionId);
    setActivePlan(recoverableWorkout.plan);
    setRecoverableWorkout(null);
    setActiveModule("workout");
  }, [recoverableWorkout]);

  const endInterruptedWorkout = useCallback(() => {
    if (!recoverableWorkout) return;
    Alert.alert(
      "End interrupted workout?",
      "Your progress will stay in workout history as a partial session.",
      [
        { text: "Keep It", style: "cancel" },
        {
          text: "End Workout",
          style: "destructive",
          onPress: async () => {
            await finalizeWorkoutSession(recoverableWorkout.sessionId, {
              ...recoverableWorkout.timer.summary,
              completed: false
            });
            await clearWorkoutRecovery();
            await refreshData();
          }
        }
      ]
    );
  }, [clearWorkoutRecovery, recoverableWorkout, refreshData]);

  const handleStartPlan = async (plan: WorkoutPlan) => {
    if (recoverableWorkout) {
      Alert.alert(
        "Workout waiting to resume",
        `Resume or end “${recoverableWorkout.plan.name}” from the Anthra hub before starting another workout.`,
        [{ text: "Go to Hub", onPress: () => setActiveModule("hub") }]
      );
      return;
    }

    try {
      const startedAt = Date.now();
      const sessionId = await startWorkoutSession(plan.id, plan.name);
      const initialTimer: WorkoutTimerState = {
        phase: "ready",
        segmentIndex: 0,
        remainingSeconds: 5,
        isRunning: true,
        startedAt,
        summary: {
          completed: false,
          progressPercent: 0,
          completedSegments: 0,
          totalSegments: 0,
          elapsedSeconds: 0
        }
      };
      await saveActiveWorkoutSnapshot({ sessionId, plan, timer: initialTimer, updatedAt: Date.now() });
      completionLoggedRef.current = false;
      setActiveTimerInitialState(null);
      setActiveSessionId(sessionId);
      setActivePlan(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start workout.";
      Alert.alert("Session error", message);
    }
  };

  const finalizeCurrentSession = useCallback(
    async (summary: WorkoutRunSummary) => {
      if (!activePlan || !activeSessionId) return;

      await finalizeWorkoutSession(activeSessionId, summary);
      if (summary.completed && !completionLoggedRef.current) {
        completionLoggedRef.current = true;
        await logWorkoutCompletion(activePlan.id);
      }
    },
    [activePlan, activeSessionId]
  );

  const handleWorkoutComplete = async (summary: WorkoutRunSummary) => {
    await finalizeCurrentSession({ ...summary, completed: true, progressPercent: 100 });
    await clearWorkoutRecovery();
    await refreshDashboard();
    await refreshHistory();
  };

  const openSessionFeedback = useCallback((sessionId: number, planName: string) => {
    setFeedbackSessionId(sessionId);
    setFeedbackPlanName(planName);
    setFeedbackRating(0);
    setFeedbackComment("");
    setFeedbackNoteModalOpen(false);
    setFeedbackOpen(true);
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackSessionId) return;
    if (feedbackRating < 1 || feedbackRating > 5) {
      Alert.alert("Pick a rating", "Rate this session from 1 to 5 stars.");
      return;
    }

    setFeedbackSaving(true);
    try {
      await saveWorkoutSessionFeedback(feedbackSessionId, feedbackRating, feedbackComment);
      setFeedbackOpen(false);
      await refreshHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save feedback.";
      Alert.alert("Feedback error", message);
    } finally {
      setFeedbackSaving(false);
    }
  }, [feedbackComment, feedbackRating, feedbackSessionId, refreshHistory]);

  const handleSaveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileNotice(null);
    try {
      const heightRaw = profileHeightCm.trim();
      const weightRaw = profileWeightKg.trim();
      const heightValue = heightRaw.length === 0 ? null : parsePositiveNumber(heightRaw);
      const weightValue = weightRaw.length === 0 ? null : parsePositiveNumber(weightRaw);

      if (heightRaw.length > 0 && heightValue == null) {
        setProfileNotice({
          type: "error",
          message: "Height must be a valid number in cm (example: 170)."
        });
        return;
      }
      if (weightRaw.length > 0 && weightValue == null) {
        setProfileNotice({
          type: "error",
          message: "Weight must be a valid number in kg (example: 70)."
        });
        return;
      }
      if (heightValue != null && (heightValue < 50 || heightValue > 300)) {
        setProfileNotice({
          type: "error",
          message: "Height must be between 50 and 300 cm."
        });
        return;
      }
      if (weightValue != null && (weightValue < 20 || weightValue > 500)) {
        setProfileNotice({
          type: "error",
          message: "Weight must be between 20 and 500 kg."
        });
        return;
      }

      const payload: UserProfile = {
        heightCm: heightValue,
        weightKg: weightValue,
        goal: profileGoal.trim()
      };
      await saveUserProfile(payload);
      await refreshProfile();
      setProfileNotice({
        type: "success",
        message: "Profile updated."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save profile.";
      setProfileNotice({
        type: "error",
        message
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfileHeightChange = (value: string) => {
    if (profileNotice) setProfileNotice(null);
    setProfileHeightCm(value);
  };

  const handleProfileWeightChange = (value: string) => {
    if (profileNotice) setProfileNotice(null);
    setProfileWeightKg(value);
  };

  const handleProfileGoalChange = (value: string) => {
    if (profileNotice) setProfileNotice(null);
    setProfileGoal(value);
  };

  const toggleGlobalWorkoutDay = (day: number) => {
    if (settingsNotice) setSettingsNotice(null);
    setSettings((prev) => {
      if (prev.workoutDays.includes(day)) {
        return { ...prev, workoutDays: prev.workoutDays.filter((value) => value !== day) };
      }
      return { ...prev, workoutDays: normalizeDays([...prev.workoutDays, day]) };
    });
  };

  const updateReminderLeadText = useCallback((index: number, value: string) => {
    if (settingsNotice) setSettingsNotice(null);
    setReminderLeadTexts((prev) => {
      const next = [...prev];
      next[index] = digitsOnly(value);
      return next;
    });
  }, [settingsNotice]);

  const handleSaveSettings = async () => {
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsNotice(null);
    try {
      const weeklyGoal = parseStrictWholeNumber(weeklyGoalText);
      if (weeklyGoal == null || weeklyGoal < 1 || weeklyGoal > 7) {
        setSettingsNotice({
          type: "error",
          message: "Weekly streak goal must be a whole number between 1 and 7."
        });
        return;
      }

      const reminderHour = parseStrictWholeNumber(reminderHourText);
      if (reminderHour == null || reminderHour < 0 || reminderHour > 23) {
        setSettingsNotice({
          type: "error",
          message: "Reminder hour must be between 0 and 23."
        });
        return;
      }

      const reminderMinute = parseStrictWholeNumber(reminderMinuteText);
      if (reminderMinute == null || reminderMinute < 0 || reminderMinute > 59) {
        setSettingsNotice({
          type: "error",
          message: "Reminder minute must be between 0 and 59."
        });
        return;
      }

      const parsedLeadMinutes: number[] = [];
      for (let index = 0; index < reminderCount; index += 1) {
        const rawLead = reminderLeadTexts[index] ?? "";
        const leadValue = parseStrictWholeNumber(rawLead);
        if (leadValue == null || leadValue < 0 || leadValue > 720) {
          setSettingsNotice({
            type: "error",
            message: `Reminder ${index + 1} lead time must be between 0 and 720 minutes.`
          });
          return;
        }
        parsedLeadMinutes.push(leadValue);
      }

      const reminderLeadMinutes = normalizeReminderLeadMinutes(parsedLeadMinutes);
      const effectiveLeadMinutes = reminderLeadMinutes.length > 0 ? reminderLeadMinutes : [60];

      const payload: UserSettings = {
        workoutDays: normalizeDays(settings.workoutDays),
        weeklyGoal,
        reminderHour,
        reminderMinute,
        reminderLeadMinutes: effectiveLeadMinutes,
        notificationsEnabled: settings.notificationsEnabled,
        reminderDelivery: settings.reminderDelivery,
        timezone: settings.timezone || getDeviceTimeZone()
      };

      await saveUserSettings(payload);
      setSettings(payload);
      setWeeklyGoalText(String(payload.weeklyGoal));
      setReminderHourText(String(payload.reminderHour));
      setReminderMinuteText(String(payload.reminderMinute));
      setReminderLeadTexts(ensureThreeLeadInputs(payload.reminderLeadMinutes));
      setReminderCount(Math.min(3, Math.max(1, payload.reminderLeadMinutes.length)));
      await refreshDashboard();

      if (
        Platform.OS === "android" &&
        payload.notificationsEnabled &&
        (payload.reminderDelivery === "alarm" || payload.reminderDelivery === "both")
      ) {
        if (Number(Platform.Version) >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        await promptForWorkoutAlarmPermission();
      }

      const reminderResult = await syncWorkoutReminderDelivery(
        payload,
        getScheduledWorkoutDays(plans, payload.workoutDays)
      );
      const reminderFailure =
        !reminderResult.supported ||
        /(?:reminder|alarm) sync failed|allow notifications|require(?:s)? an android|unavailable|not available/i.test(
          reminderResult.message
        );
      setSettingsNotice({
        type: reminderFailure ? "error" : "success",
        message: reminderResult.message ?? "Settings updated."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save settings.";
      setSettingsNotice({
        type: "error",
        message
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setSettingsNotice(null);
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is not available on this device.");
      }
      const backup = await createAnthraBackup();
      const dateLabel = new Date().toISOString().slice(0, 10);
      const uri = `${FileSystem.cacheDirectory}anthra-backup-${dateLabel}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2), {
        encoding: FileSystem.EncodingType.UTF8
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Save Anthra backup",
        UTI: "public.json"
      });
      setSettingsNotice({ type: "success", message: "Backup created. Password Buddy secrets were not included." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create backup.";
      setSettingsNotice({ type: "error", message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    if (backupBusy) return;
    setSettingsNotice(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
        multiple: false
      });
      if (selection.canceled || !selection.assets[0]) return;
      const raw = await FileSystem.readAsStringAsync(selection.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (raw.length > 15_000_000) throw new Error("Backup is too large to restore safely.");
      const parsed: unknown = JSON.parse(raw);

      Alert.alert(
        "Restore this backup?",
        "Workouts, alarms, reminders, lists, profile, and settings on this device will be replaced. Password Buddy stays unchanged.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: () => {
              const restore = async () => {
                setBackupBusy(true);
                try {
                  await restoreAnthraBackup(parsed);
                  await replaceNativeAlarms(await getAlarmItems()).catch(() => undefined);
                  setRecoverableWorkout(null);
                  const [nextData, nextSettings, , , restoredThemeMode] = await Promise.all([
                    refreshData(),
                    refreshSettings(),
                    refreshEnabledReminderCount(),
                    refreshProfile(),
                    getAppThemeMode()
                  ]);
                  setThemeMode(restoredThemeMode);
                  await syncAllNotifications(nextSettings, nextData.plans, true);
                  setSettingsNotice({ type: "success", message: "Backup restored successfully." });
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Could not restore backup.";
                  setSettingsNotice({ type: "error", message });
                } finally {
                  setBackupBusy(false);
                }
              };
              restore().catch(() => undefined);
            }
          }
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read backup.";
      setSettingsNotice({ type: "error", message });
    }
  };

  const clearRevealTimeout = (entryId: number) => {
    const existing = revealTimeoutsRef.current[entryId];
    if (existing) {
      clearTimeout(existing);
      delete revealTimeoutsRef.current[entryId];
    }
  };

  const scheduleRevealAutoHide = (entryId: number) => {
    clearRevealTimeout(entryId);
    revealTimeoutsRef.current[entryId] = setTimeout(() => {
      setRevealedVaultIds((prev) => prev.filter((id) => id !== entryId));
      clearRevealTimeout(entryId);
    }, 10_000);
  };

  const copyVaultPassword = async (entryId: number) => {
    const entry = vaultEntries.find((candidate) => candidate.id === entryId);
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
  };

  const requestVaultSensitiveAction = async (mode: "reveal" | "copy", entryId: number) => {
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
  };

  const openPinModal = (mode: "unlock" | "reveal" | "copy", entryId: number | null = null) => {
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
  };

  const closePinModal = () => {
    cancelPinVerification();
    setPinModalInput("");
    setPinModalError("");
    setPinVerifying(false);
    setPinModalTargetEntryId(null);
  };

  const verifyPinModal = async () => {
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
        return;
      }

      vaultPinAttemptRef.current = registerVaultPinSuccess();

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
    } finally {
      if (requestIsCurrent()) setPinVerifying(false);
    }
  };

  const enterPasswordManager = async () => {
    const security = await refreshVaultSecurity();
    setActiveModule("password");
    if (security.hasPin) {
      if (security.biometricsEnabled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Password Buddy",
          cancelLabel: "Use PIN",
          fallbackLabel: "Use PIN",
          disableDeviceFallback: true
        }).catch(() => null);
        if (result?.success) {
          vaultPinAttemptRef.current = registerVaultPinSuccess();
          await refreshVaultEntries();
          setVaultUnlocked(true);
          return;
        }
      }
      openPinModal("unlock");
    } else {
      setVaultUnlocked(false);
    }
  };

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

  const closeTimer = async (summary: WorkoutRunSummary) => {
    const finishedSessionId = activeSessionId;
    const finishedPlanName = activePlan?.name ?? "Workout";
    setWorkoutCompletionTransition(true);
    try {
      await finalizeCurrentSession(summary);
    } finally {
      try {
        await clearWorkoutRecovery();
        setActivePlan(null);
        setActiveSessionId(null);
        setActiveTimerInitialState(null);
        await refreshData();
        if (summary.completed && finishedSessionId) {
          openSessionFeedback(finishedSessionId, finishedPlanName);
        }
      } finally {
        setWorkoutCompletionTransition(false);
      }
    }
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      if (activePlan) {
        // TimerScreen owns workout exit confirmation and handles this event next.
        return false;
      }
      if (feedbackNoteModalOpen) {
        setFeedbackNoteModalOpen(false);
        return true;
      }
      if (feedbackOpen) {
        if (!feedbackSaving) setFeedbackOpen(false);
        return true;
      }
      if (vaultResetPinOpen) {
        closeVaultResetPin();
        return true;
      }
      if (vaultEditorOpen) {
        setVaultEditorOpen(false);
        return true;
      }
      if (pinModalOpen) {
        if (!pinVerifying) closePinModal();
        return true;
      }
      if (editorOpen) {
        setEditorOpen(false);
        setEditingPlan(null);
        return true;
      }
      if (activeModule === "workout" && activeTab !== "home") {
        setActiveTab("home");
        return true;
      }
      if (activeModule !== "hub") {
        setActiveModule("hub");
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        return false;
      }
      lastBackPressRef.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [
    activeModule,
    activePlan,
    activeTab,
    editorOpen,
    feedbackNoteModalOpen,
    feedbackOpen,
    feedbackSaving,
    keyboardHeight,
    pinModalOpen,
    pinVerifying,
    vaultEditorOpen,
    vaultResetPinOpen,
    vaultResetPinSaving
  ]);

  const currentWeekday = getDayPartsInTimeZone(
    Date.now(),
    0,
    settings.timezone || deviceTimeZone
  ).weekday;
  const todaysPlans = useMemo(
    () => getPlansForWeekday(plans, currentWeekday),
    [currentWeekday, plans]
  );
  const todayWorkoutPlans = todaysPlans;
  const keyboardSafeBottomPadding = keyboardHeight > 0 ? keyboardHeight + 16 : 24;
  const semanticTheme = resolveTheme(themeMode, systemColorScheme);
  const isDarkMode = semanticTheme.isDark;
  const appBackground = semanticTheme.colors.canvas;
  const screenBackgrounds = useMemo(
    () => createScreenBackgrounds(semanticTheme.colors),
    [semanticTheme.colors]
  );
  const panelBackground = semanticTheme.colors.surface;
  const cardBackground = semanticTheme.colors.surfaceElevated;
  const inputBackground = semanticTheme.colors.surfaceSubtle;
  const borderColor = semanticTheme.colors.border;
  const textPrimary = semanticTheme.colors.textPrimary;
  const textMuted = semanticTheme.colors.textSecondary;
  const moduleTheme = useMemo(() => resolveModuleTheme(isDarkMode), [isDarkMode]);
  const workoutTheme = moduleTheme;


  let content;

  if (!ready) {
    content = (
      <ScreenLayout
        {...screenBackgrounds.canvas}
        safeAreaEdges={["top", "bottom"]}
        contentStyle={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
      >
        {bootstrapError ? (
          <View
            accessibilityRole="alert"
            className="w-full max-w-[440px] rounded-3xl border p-6"
            style={{ borderColor, backgroundColor: panelBackground }}
          >
            <Text className="text-sm font-black uppercase tracking-[2px]" style={{ color: workoutTheme.accent }}>
              Anthra
            </Text>
            <Text className="mt-3 text-2xl font-black" style={{ color: textPrimary }}>
              We couldn’t finish starting the app
            </Text>
            <Text className="mt-2 text-base leading-6" style={{ color: textMuted }}>
              Your data has not been changed. Retry the startup checks, or restart the app if the problem continues.
            </Text>
            <Text selectable className="mt-3 text-sm" style={{ color: textMuted }}>
              {bootstrapError}
            </Text>
            <Pressable
              onPress={() => setBootstrapAttempt((attempt) => attempt + 1)}
              accessibilityRole="button"
              accessibilityLabel="Retry starting Anthra"
              className="mt-5 min-h-[50px] items-center justify-center rounded-xl px-5"
              style={{ backgroundColor: semanticTheme.colors.brandSolid }}
            >
              <Text className="text-base font-black" style={{ color: semanticTheme.colors.textOnBrandSolid }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator size="large" color={workoutTheme.accent} accessibilityLabel="Starting Anthra" />
        )}
      </ScreenLayout>
    );
  } else if (!activePlan && activeModule === "hub") {
    content = (
      <AnthraHomeScreen
        stats={stats}
        todayWorkoutCount={todayWorkoutPlans.length}
        enabledReminderCount={enabledReminderCount}
        recoverableWorkout={recoverableWorkout}
        onOpenWorkout={() => {
          setActiveModule("workout");
          setPlanListMode("all");
          setActiveTab("home");
        }}
        onChooseTodayWorkout={() => {
          setActiveModule("workout");
          setPlanListMode("today");
          setActiveTab("plans");
        }}
        onOpenActivity={() => setActiveModule("activity")}
        onOpenReminders={() => setActiveModule("reminder")}
        onOpenTracker={() => setActiveModule("tracker")}
        onOpenLists={() => setActiveModule("list")}
        onOpenAlarms={() => setActiveModule("alarm")}
        onOpenVault={() => {
          enterPasswordManager().catch(() => undefined);
        }}
        onOpenProfile={() => {
          setActiveModule("workout");
          setActiveTab("profile");
        }}
        onOpenSettings={() => {
          setActiveModule("workout");
          setActiveTab("settings");
        }}
        onResumeWorkout={resumeInterruptedWorkout}
        onEndWorkout={endInterruptedWorkout}
      />
    );
  } else if (!activePlan && activeModule === "activity") {
    content = (
      <ActivityBuddyScreen
        onBack={() => setActiveModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "tracker") {
    content = (
      <TrackerBuddyScreen
        onBack={() => setActiveModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "alarm") {
    content = (
      <AlarmBuddyScreen
        onBack={() => setActiveModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "reminder") {
    content = (
      <ReminderBuddyScreen
        onBack={() => {
          setReminderInitialTab(undefined);
          setActiveModule("hub");
        }}
        initialTab={reminderInitialTab}
      />
    );
  } else if (!activePlan && activeModule === "password") {
    content = (
      <PasswordManagerScreen
        keyboardBottomPadding={keyboardSafeBottomPadding}
        hasPin={vaultHasPin}
        unlocked={vaultUnlocked}
        newPin={vaultNewPin}
        confirmPin={vaultConfirmPin}
        biometricsEnabled={vaultBiometricsEnabled}
        entries={vaultEntries}
        revealedEntryIds={revealedVaultIds}
        notice={vaultNotice}
        onBack={() => setActiveModule("hub")}
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
        onCopyEntryPassword={(entryId) => requestVaultSensitiveAction("copy", entryId).catch(() => undefined)}
      />
    );
  } else if (!activePlan && activeModule === "list") {
    content = (
      <ListBuddyScreen
        onBack={() => {
          setActiveModule("hub");
        }}
      />
    );
  } else if (activePlan) {
    content = (
      <TimerScreen
        plan={activePlan}
        onComplete={handleWorkoutComplete}
        onBack={closeTimer}
        initialState={activeTimerInitialState}
        onStateChange={handleTimerStateChange}
        accentColor={workoutTheme.accent}
        accentSoftColor={workoutTheme.accentSoft}
      />
    );
  } else if (!activePlan && activeModule === "workout") {
    content = (
      <WorkoutBuddyScreen
        onBack={() => setActiveModule("hub")}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        planListMode={planListMode}
        onPlanListModeChange={setPlanListMode}
        plans={plans}
        stats={stats}
        history={history}
        settings={settings}
        profileHeightCm={profileHeightCm}
        profileWeightKg={profileWeightKg}
        profileGoal={profileGoal}
        onProfileHeightChange={handleProfileHeightChange}
        onProfileWeightChange={handleProfileWeightChange}
        onProfileGoalChange={handleProfileGoalChange}
        onSaveProfile={() => {
          handleSaveProfile().catch(() => undefined);
        }}
        profileSaving={profileSaving}
        profileNotice={profileNotice}
        weeklyGoalText={weeklyGoalText}
        reminderHourText={reminderHourText}
        reminderMinuteText={reminderMinuteText}
        reminderCount={reminderCount}
        reminderLeadTexts={reminderLeadTexts}
        onWeeklyGoalTextChange={setWeeklyGoalText}
        onReminderHourTextChange={setReminderHourText}
        onReminderMinuteTextChange={setReminderMinuteText}
        onReminderCountChange={setReminderCount}
        onReminderLeadTextChange={updateReminderLeadText}
        onToggleGlobalWorkoutDay={toggleGlobalWorkoutDay}
        onSettingsChange={setSettings}
        onClearSettingsNotice={() => setSettingsNotice(null)}
        onSaveSettings={() => {
          handleSaveSettings().catch(() => undefined);
        }}
        settingsSaving={settingsSaving}
        settingsNotice={settingsNotice}
        onExportBackup={() => {
          handleExportBackup().catch(() => undefined);
        }}
        onImportBackup={() => {
          handleImportBackup().catch(() => undefined);
        }}
        backupBusy={backupBusy}
        onStartPlan={(plan) => {
          handleStartPlan(plan).catch(() => undefined);
        }}
        onCreatePlan={openCreatePlan}
        onEditPlan={openEditPlan}
        onDeletePlan={handleDeletePlan}
        onSharePlan={(plan) => {
          handleSharePlan(plan).catch(() => undefined);
        }}
        onImportPlan={handleImportPlan}
        editorOpen={editorOpen}
        editingPlan={editingPlan}
        onCloseEditor={() => {
          setEditorOpen(false);
          setEditingPlan(null);
        }}
        onSavePlan={handleSavePlan}
        onDeleteHistoryEntry={handleDeleteHistoryEntry}
        keyboardBottomPadding={keyboardSafeBottomPadding}
      />
    );
  } else {
    content = (
      <AnthraHomeScreen
        stats={stats}
        todayWorkoutCount={todayWorkoutPlans.length}
        enabledReminderCount={enabledReminderCount}
        recoverableWorkout={recoverableWorkout}
        onOpenWorkout={() => {
          setActiveModule("workout");
          setPlanListMode("all");
          setActiveTab("home");
        }}
        onChooseTodayWorkout={() => {
          setActiveModule("workout");
          setPlanListMode("today");
          setActiveTab("plans");
        }}
        onOpenActivity={() => setActiveModule("activity")}
        onOpenReminders={() => setActiveModule("reminder")}
        onOpenTracker={() => setActiveModule("tracker")}
        onOpenLists={() => setActiveModule("list")}
        onOpenAlarms={() => setActiveModule("alarm")}
        onOpenVault={() => {
          enterPasswordManager().catch(() => undefined);
        }}
        onOpenProfile={() => {
          setActiveModule("workout");
          setActiveTab("profile");
        }}
        onOpenSettings={() => {
          setActiveModule("workout");
          setActiveTab("settings");
        }}
        onResumeWorkout={resumeInterruptedWorkout}
        onEndWorkout={endInterruptedWorkout}
      />
    );
  }

  return (
    <AppProviders themeMode={themeMode} onThemeModeChange={handleThemeModeChange}>
      <View className="flex-1" style={{ flex: 1, backgroundColor: appBackground }}>
        {content}

      <Modal
        visible={feedbackOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!feedbackSaving) setFeedbackOpen(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 px-6"
          style={{ backgroundColor: semanticTheme.colors.scrim }}
        >
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}
          >
          <View
            accessibilityViewIsModal
            className="w-full rounded-3xl border p-5"
            style={{ borderColor, backgroundColor: cardBackground, maxWidth: 520, alignSelf: "center" }}
          >
            <Text className="text-xl font-black" style={{ color: textPrimary }}>Rate Session</Text>
            <Text className="mt-2 text-sm" style={{ color: textMuted }}>
              {feedbackPlanName} is complete. Add a quick rating and optional note for your history.
            </Text>

            <View className="mt-4 flex-row justify-between rounded-2xl border px-3 py-3" style={{ borderColor, backgroundColor: inputBackground }}>
              {[1, 2, 3, 4, 5].map((star) => {
                const active = feedbackRating >= star;
                return (
                  <Pressable
                    key={`rating-${star}`}
                    onPress={() => setFeedbackRating(star)}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate ${star} out of 5`}
                    accessibilityState={{ selected: feedbackRating === star }}
                    className="h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: active ? withAlpha(workoutTheme.accent, 0.25) : panelBackground }}
                  >
                    <Star
                      accessible={false}
                      size={23}
                      color={active ? workoutTheme.accent : semanticTheme.colors.textTertiary}
                      fill={active ? workoutTheme.accent : "transparent"}
                    />
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => setFeedbackNoteModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Add or edit session note"
              className="mt-4 min-h-[110px] rounded-2xl border px-4 py-3"
              style={{ borderColor: semanticTheme.colors.borderStrong, backgroundColor: inputBackground }}
            >
              <Text className="text-xs font-semibold uppercase tracking-[1.2px]" style={{ color: textMuted }}>
                Session Note
              </Text>
              <Text
                className="mt-2 text-sm"
                style={{ color: feedbackComment.trim() ? textPrimary : semanticTheme.colors.textTertiary }}
              >
                {feedbackComment.trim() || "Tap to add how this session felt."}
              </Text>
            </Pressable>

            <View className="mt-5 flex-row gap-3">
              <Button
                label="Later"
                onPress={() => setFeedbackOpen(false)}
                disabled={feedbackSaving}
                variant="outline"
                fullWidth
                style={{ flex: 1 }}
              />
              <Button
                label="Save feedback"
                onPress={handleSubmitFeedback}
                loading={feedbackSaving}
                fullWidth
                style={{ flex: 1 }}
              />
            </View>
          </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={feedbackNoteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackNoteModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 px-6"
          style={{ backgroundColor: semanticTheme.colors.scrim }}
        >
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}
          >
          <View
            accessibilityViewIsModal
            className="w-full rounded-3xl border p-5"
            style={{ borderColor, backgroundColor: cardBackground, maxWidth: 520, alignSelf: "center" }}
          >
            <Text className="text-xl font-black" style={{ color: textPrimary }}>Session Note</Text>
            <TextField
              label="How did it feel?"
              value={feedbackComment}
              onChangeText={setFeedbackComment}
              multiline
              autoFocus
              textAlignVertical="top"
              maxLength={400}
              placeholder="Energy, effort, pain, or anything worth remembering"
              helperText={`${feedbackComment.length}/400 characters`}
              containerStyle={{ marginTop: 16 }}
            />
            <View className="mt-5 flex-row gap-3">
              <Button
                label="Done"
                onPress={() => setFeedbackNoteModalOpen(false)}
                variant="outline"
                fullWidth
                style={{ flex: 1 }}
              />
              <Button
                label="Clear note"
                onPress={() => {
                  setFeedbackComment("");
                  setFeedbackNoteModalOpen(false);
                }}
                variant="secondary"
                fullWidth
                style={{ flex: 1 }}
              />
            </View>
          </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </Modal>
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

        {showSplashOverlay && (
          <LaunchOverlay
            opacity={splashOpacity}
          />
        )}
        </View>
    </AppProviders>
  );
}
