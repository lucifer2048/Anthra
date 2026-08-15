import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Animated,
  Alert,
  BackHandler,
  Keyboard,
  Linking,
  PermissionsAndroid,
  Platform,
  Share,
  Text,
  ToastAndroid,
  useColorScheme as useSystemColorScheme,
  View
} from "react-native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";
import Reanimated, { FadeIn, FadeInLeft, FadeInRight, useReducedMotion } from "react-native-reanimated";

import "./src/utils/reminderNotificationTask";
import { TimerScreen } from "./src/components/TimerScreen";
import { AlarmBuddyScreen } from "./src/components/AlarmBuddyScreen";
import { LaunchOverlay } from "./src/components/LaunchOverlay";
import { type WorkoutTab } from "./src/components/WorkoutTabBar";
import type { ReminderTab } from "./src/components/ReminderTabBar";
import { ScreenLayout } from "./src/components/layout";
import { BlockingLoadingState, Button, Card } from "./src/components/ui";
import { ActivityBuddyScreen } from "./src/features/activity/ActivityBuddyScreen";
import { AnthraHomeScreen } from "./src/features/hub/AnthraHomeScreen";
import { ListBuddyScreen } from "./src/features/list/ListBuddyScreen";
import { TrackerBuddyScreen } from "./src/features/tracker/TrackerBuddyScreen";
import { AccountOnboardingGate, AccountScreen, initAccountDatabase } from "./src/features/account";
import { FriendsScreen } from "./src/features/social";
import { publishFriendActivityEvent } from "./src/features/social";
import { supabase } from "./src/services/supabaseClient";
import { ReminderBuddyScreen } from "./src/features/reminder/ReminderBuddyScreen";
import { VaultBuddyScreen } from "./src/features/vault/VaultBuddyScreen";
import { WorkoutBuddyScreen } from "./src/features/workout/WorkoutBuddyScreen";
import { WorkoutFeedbackModals } from "./src/features/workout/WorkoutFeedbackModals";
import { NutritionBuddyScreen } from "./src/features/nutrition/NutritionBuddyScreen";
import { syncTrackerNotifications } from "./src/features/tracker/trackerNotifications";
import { AppProviders } from "./src/providers";
import { createScreenBackgrounds, resolveTheme, themes, type ThemeMode } from "./src/design-system";
import {
  clearActiveWorkoutSnapshot,
  createAnthraBackup,
  deletePlan,
  deleteWorkoutSession,
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
  getWorkoutHistory,
  initDatabase,
  logWorkoutCompletion,
  markReminderOccurrenceDone,
  saveActiveWorkoutSnapshot,
  saveAppThemeMode,
  savePlan,
  saveWorkoutSessionFeedback,
  saveUserProfile,
  saveUserSettings,
  startWorkoutSession,
  restoreAnthraBackup
} from "./src/db";
import { normalizeDays } from "./src/constants/schedule";
import type {
  ActiveWorkoutSnapshot,
  DashboardStats,
  UserProfile,
  UserSettings,
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
import {
  digitsOnly,
  ensureThreeLeadInputs,
  formatMetricValue,
  normalizeReminderLeadMinutes,
  parsePositiveNumber,
  parseStrictWholeNumber
} from "./src/utils/format";
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

type AppModule = "hub" | "workout" | "profile" | "settings" | "reminder" | "password" | "list" | "alarm" | "activity" | "nutrition" | "tracker" | "account" | "friends";

type ModuleTheme = {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  icon: string;
  onAccent: string;
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

const SCREEN_FORWARD_ENTERING = FadeInRight.duration(220);
const SCREEN_BACKWARD_ENTERING = FadeInLeft.duration(220);


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

export default function App() {
  const systemColorScheme = useSystemColorScheme();
  const reduceMotion = useReducedMotion();
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<WorkoutTab>("home");
  const [friendsInitialTab, setFriendsInitialTab] = useState<"friends" | "leaderboard">("friends");
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
  const [navDirection, setNavDirection] = useState<"forward" | "backward">("forward");
  const [enabledReminderCount, setEnabledReminderCount] = useState(0);
  const [reminderInitialTab, setReminderInitialTab] = useState<ReminderTab | undefined>(undefined);

  const openModule = useCallback((module: AppModule) => {
    setNavDirection(module === "hub" ? "backward" : "forward");
    setActiveModule(module);
  }, []);
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
  const hubScrollOffsetRef = useRef(0);
  const hasAnimatedHubCardsRef = useRef(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleHubCardsAnimated = useCallback(() => {
    hasAnimatedHubCardsRef.current = true;
  }, []);

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
    await initAccountDatabase();
    const [nextData, , nextSettings, , recoveredWorkout, storedThemeMode] = await Promise.all([
      refreshData(),
      refreshProfile(),
      refreshSettings(),
      refreshEnabledReminderCount(),
      getActiveWorkoutSnapshot(),
      getAppThemeMode()
    ]);
    setRecoverableWorkout(recoveredWorkout);
    setThemeMode(storedThemeMode);
    setReady(true);
    setTimeout(() => {
      syncAllNotifications(nextSettings, nextData.plans, true).catch(() => undefined);
    }, 250);
  }, [refreshData, refreshEnabledReminderCount, refreshProfile, refreshSettings, syncAllNotifications]);

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
    if (!bootstrapError || !showSplashOverlay) return;
    splashOpacity.setValue(0);
    setShowSplashOverlay(false);
  }, [bootstrapError, showSplashOverlay, splashOpacity]);

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
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [promptForWorkoutAlarmPermission, ready, refreshDashboard, refreshData, refreshEnabledReminderCount, refreshHistory, refreshSettings, syncAllNotifications]);

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
    return () => {
      if (workoutSnapshotSaveRef.current) clearTimeout(workoutSnapshotSaveRef.current);
    };
  }, []);

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
    setNavDirection("forward");
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
        [{ text: "Go to Hub", onPress: () => openModule("hub") }]
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
      setNavDirection("forward");
      setActivePlan(plan);
      if (supabase) {
        publishFriendActivityEvent(supabase, "workout_started").catch(() => undefined);
      }
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
        message: "Body details updated."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save body details.";
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
        "Workouts, alarms, reminders, lists, nutrition history, body details, and settings on this device will be replaced. Password Buddy stays unchanged.",
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

  const closeTimer = async (summary: WorkoutRunSummary) => {
    const finishedSessionId = activeSessionId;
    const finishedPlanName = activePlan?.name ?? "Workout";
    setWorkoutCompletionTransition(true);
    try {
      await finalizeCurrentSession(summary);
    } finally {
      try {
        await clearWorkoutRecovery();
        setNavDirection("backward");
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
        openModule("hub");
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
    keyboardHeight
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
          <Card
            accessibilityRole="alert"
            variant="elevated"
            padding="large"
            style={{ width: "100%", maxWidth: 440 }}
          >
            <Text style={[semanticTheme.typography.eyebrow, { color: workoutTheme.accent }]}>
              Anthra
            </Text>
            <Text accessibilityRole="header" style={[semanticTheme.typography.titleLarge, { color: textPrimary, marginTop: semanticTheme.spacing.md }]}>
              We couldn’t finish starting the app
            </Text>
            <Text style={[semanticTheme.typography.bodyLarge, { color: textMuted, marginTop: semanticTheme.spacing.sm }]}>
              Your data has not been changed. Retry the startup checks, or restart the app if the problem continues.
            </Text>
            <Text selectable style={[semanticTheme.typography.caption, { color: textMuted, marginTop: semanticTheme.spacing.md }]}>
              {bootstrapError}
            </Text>
            <Button
              label="Retry"
              onPress={() => setBootstrapAttempt((attempt) => attempt + 1)}
              accessibilityLabel="Retry starting Anthra"
              fullWidth
              style={{ marginTop: semanticTheme.spacing.xl }}
            />
          </Card>
        ) : (
          <BlockingLoadingState title="Starting Anthra" message="Preparing your private workspace…" />
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
          openModule("workout");
          setPlanListMode("all");
          setActiveTab("home");
        }}
        onChooseTodayWorkout={() => {
          openModule("workout");
          setPlanListMode("today");
          setActiveTab("plans");
        }}
        onOpenActivity={() => openModule("activity")}
        onOpenNutrition={() => openModule("nutrition")}
        onOpenReminders={() => openModule("reminder")}
        onOpenTracker={() => openModule("tracker")}
        onOpenLists={() => openModule("list")}
        onOpenAlarms={() => openModule("alarm")}
        onOpenVault={() => openModule("password")}
        onOpenProfile={() => {
          openModule("profile");
        }}
        onOpenSettings={() => {
          openModule("settings");
        }}
        onOpenAccount={() => openModule("account")}
        onOpenFriends={() => {
          setFriendsInitialTab("friends");
          openModule("friends");
        }}
        onOpenFriendsLeaderboard={() => {
          setFriendsInitialTab("leaderboard");
          openModule("friends");
        }}
        onResumeWorkout={resumeInterruptedWorkout}
        onEndWorkout={endInterruptedWorkout}
        initialScrollOffset={hubScrollOffsetRef.current}
        onScrollOffsetChange={(offset) => {
          hubScrollOffsetRef.current = Math.max(0, offset);
        }}
        animateCards={!hasAnimatedHubCardsRef.current}
        onCardsAnimated={handleHubCardsAnimated}
      />
    );
  } else if (!activePlan && activeModule === "activity") {
    content = (
      <ActivityBuddyScreen
        onBack={() => openModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "nutrition") {
    content = <NutritionBuddyScreen onBack={() => openModule("hub")} />;
  } else if (!activePlan && activeModule === "account") {
    content = <AccountScreen onBack={() => openModule("hub")} />;
  } else if (!activePlan && activeModule === "friends") {
    content = (
      <FriendsScreen
        onBack={() => openModule("hub")}
        onOpenAccount={() => openModule("account")}
        initialTab={friendsInitialTab}
      />
    );
  } else if (!activePlan && activeModule === "tracker") {
    content = (
      <TrackerBuddyScreen
        onBack={() => openModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "alarm") {
    content = (
      <AlarmBuddyScreen
        onBack={() => openModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "reminder") {
    content = (
      <ReminderBuddyScreen
        onBack={() => {
          setReminderInitialTab(undefined);
          openModule("hub");
        }}
        initialTab={reminderInitialTab}
      />
    );
  } else if (!activePlan && activeModule === "password") {
    content = <VaultBuddyScreen onBack={() => openModule("hub")} />;
  } else if (!activePlan && activeModule === "list") {
    content = (
      <ListBuddyScreen
        onBack={() => {
          openModule("hub");
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
  } else if (!activePlan && (activeModule === "workout" || activeModule === "profile" || activeModule === "settings")) {
    content = (
      <WorkoutBuddyScreen
        onBack={() => openModule("hub")}
        section={activeModule}
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
          openModule("workout");
          setPlanListMode("all");
          setActiveTab("home");
        }}
        onChooseTodayWorkout={() => {
          openModule("workout");
          setPlanListMode("today");
          setActiveTab("plans");
        }}
        onOpenActivity={() => openModule("activity")}
        onOpenNutrition={() => openModule("nutrition")}
        onOpenReminders={() => openModule("reminder")}
        onOpenTracker={() => openModule("tracker")}
        onOpenLists={() => openModule("list")}
        onOpenAlarms={() => openModule("alarm")}
        onOpenVault={() => openModule("password")}
        onOpenProfile={() => {
          openModule("profile");
        }}
        onOpenSettings={() => {
          openModule("settings");
        }}
        onOpenAccount={() => openModule("account")}
        onOpenFriends={() => {
          setFriendsInitialTab("friends");
          openModule("friends");
        }}
        onOpenFriendsLeaderboard={() => {
          setFriendsInitialTab("leaderboard");
          openModule("friends");
        }}
        onResumeWorkout={resumeInterruptedWorkout}
        onEndWorkout={endInterruptedWorkout}
        initialScrollOffset={hubScrollOffsetRef.current}
        onScrollOffsetChange={(offset) => {
          hubScrollOffsetRef.current = Math.max(0, offset);
        }}
        animateCards={!hasAnimatedHubCardsRef.current}
        onCardsAnimated={handleHubCardsAnimated}
      />
    );
  }

  return (
    <AppProviders
      themeMode={themeMode}
      onThemeModeChange={handleThemeModeChange}
      localDataReady={ready}
    >
      <AccountOnboardingGate>
        <View style={{ flex: 1, backgroundColor: appBackground }}>
          <Reanimated.View
            key={!ready ? "startup" : activePlan ? `timer-${activeSessionId ?? activePlan.id}` : activeModule}
            entering={reduceMotion ? undefined : navDirection === "forward" ? SCREEN_FORWARD_ENTERING : SCREEN_BACKWARD_ENTERING}
            style={{ flex: 1, backgroundColor: appBackground }}
          >
            {content}
          </Reanimated.View>

          <WorkoutFeedbackModals
          feedbackOpen={feedbackOpen}
          feedbackNoteOpen={feedbackNoteModalOpen}
          planName={feedbackPlanName}
          rating={feedbackRating}
          comment={feedbackComment}
          saving={feedbackSaving}
          accentColor={workoutTheme.accent}
          onRatingChange={setFeedbackRating}
          onCommentChange={setFeedbackComment}
          onOpenNote={() => setFeedbackNoteModalOpen(true)}
          onCloseNote={() => setFeedbackNoteModalOpen(false)}
          onDismiss={() => setFeedbackOpen(false)}
          onSubmit={() => {
            handleSubmitFeedback().catch(() => undefined);
          }}
          />

          {showSplashOverlay && (
            <LaunchOverlay
              opacity={splashOpacity}
            />
          )}
        </View>
      </AccountOnboardingGate>
    </AppProviders>
  );
}
