import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  Alert,
  Linking,
  PermissionsAndroid,
  Platform,
  Share,
  ToastAndroid
} from "react-native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Clipboard from "expo-clipboard";

import { type WorkoutTab } from "../../components/WorkoutTabBar";
import { publishFriendActivityEvent } from "../../features/social";
import { supabase } from "../../services/supabaseClient";
import { normalizeDays } from "../../constants/schedule";
import {
  clearActiveWorkoutSnapshot,
  createAnthraBackup,
  deletePlan,
  deleteWorkoutSession,
  finalizeWorkoutSession,
  getAlarmItems,
  getAppThemeMode,
  getUserProfile,
  getUserSettings,
  logWorkoutCompletion,
  restoreAnthraBackup,
  saveActiveWorkoutSnapshot,
  savePlan,
  saveUserProfile,
  saveUserSettings,
  saveWorkoutSessionFeedback,
  startWorkoutSession
} from "../../db";
import type { ThemeMode } from "../../design-system";
import type {
  ActiveWorkoutSnapshot,
  UserProfile,
  UserSettings,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput,
  WorkoutRunSummary,
  WorkoutTimerState
} from "../../types";
import { replaceNativeAlarms } from "../../utils/alarmNative";
import { syncWorkoutReminderDelivery } from "../../utils/reminders";
import {
  digitsOnly,
  ensureThreeLeadInputs,
  formatMetricValue,
  normalizeReminderLeadMinutes,
  parsePositiveNumber,
  parseStrictWholeNumber
} from "../../utils/format";
import {
  createPlanShareFileContents,
  createPlanShareMessage,
  isPlanShareUrl,
  parsePlanShareText,
  parsePlanShareUrl
} from "../../utils/planSharing";
import { getDayPartsInTimeZone, getDeviceTimeZone } from "../../utils/timezone";
import { getPlansForWeekday, getScheduledWorkoutDays } from "../../utils/workoutSchedule";
import { goHub, openHub, openTimer, openWorkout } from "../navigation";
import { INITIAL_SETTINGS } from "../constants";
import type { RefreshDataResult, SyncAllNotificationsFn } from "./useAppBootstrap";

type UseWorkoutShellParams = {
  plans: WorkoutPlan[];
  recoverableWorkout: ActiveWorkoutSnapshot | null;
  setRecoverableWorkout: (value: ActiveWorkoutSnapshot | null) => void;
  refreshData: () => Promise<RefreshDataResult>;
  refreshDashboard: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshEnabledReminderCount: () => Promise<unknown>;
  syncAllNotifications: SyncAllNotificationsFn;
  promptForWorkoutAlarmPermission: () => Promise<boolean>;
  setThemeMode: (mode: ThemeMode) => void;
  setShowSplashOverlay: (value: boolean) => void;
  deviceTimeZone: string;
  workoutFlowBusyRef: MutableRefObject<boolean>;
};

export function useWorkoutShell({
  plans,
  recoverableWorkout,
  setRecoverableWorkout,
  refreshData,
  refreshDashboard,
  refreshHistory,
  refreshEnabledReminderCount,
  syncAllNotifications,
  promptForWorkoutAlarmPermission,
  setThemeMode,
  setShowSplashOverlay,
  deviceTimeZone,
  workoutFlowBusyRef
}: UseWorkoutShellParams) {
  const [activeTab, setActiveTab] = useState<WorkoutTab>("home");
  const [planListMode, setPlanListMode] = useState<"all" | "today">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeTimerInitialState, setActiveTimerInitialState] = useState<WorkoutTimerState | null>(null);
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

  const completionLoggedRef = useRef(false);
  const workoutSnapshotSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledPlanShareUrlsRef = useRef(new Set<string>());

  const isWorkoutFlowBusy = Boolean(
    activePlan || feedbackOpen || feedbackNoteModalOpen || workoutCompletionTransition
  );
  workoutFlowBusyRef.current = isWorkoutFlowBusy;

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
                  openWorkout({ tab: "plans", planListMode: "all" });
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
    [refreshData, setShowSplashOverlay, settings]
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
  }, [setRecoverableWorkout]);

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
    openTimer();
  }, [recoverableWorkout, setRecoverableWorkout]);

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
        [{ text: "Go to Hub", onPress: () => openHub() }]
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
      if (supabase) {
        publishFriendActivityEvent(supabase, "workout_started").catch(() => undefined);
      }
      openTimer();
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

  const updateReminderLeadText = useCallback(
    (index: number, value: string) => {
      if (settingsNotice) setSettingsNotice(null);
      setReminderLeadTexts((prev) => {
        const next = [...prev];
        next[index] = digitsOnly(value);
        return next;
      });
    },
    [settingsNotice]
  );

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
        "Workouts, alarms, reminders, lists, tracker, activity, nutrition history, body details, and settings on this device will be replaced. Password Buddy stays unchanged.",
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
        setActivePlan(null);
        setActiveSessionId(null);
        setActiveTimerInitialState(null);
        await refreshData();
        if (summary.completed && finishedSessionId) {
          openSessionFeedback(finishedSessionId, finishedPlanName);
        }
      } finally {
        setWorkoutCompletionTransition(false);
        goHub();
      }
    }
  };

  const onCloseEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingPlan(null);
  }, []);

  const clearSettingsNotice = useCallback(() => setSettingsNotice(null), []);

  const currentWeekday = getDayPartsInTimeZone(
    Date.now(),
    0,
    settings.timezone || deviceTimeZone
  ).weekday;

  const todayWorkoutPlans = useMemo(
    () => getPlansForWeekday(plans, currentWeekday),
    [currentWeekday, plans]
  );

  return {
    activeTab,
    setActiveTab,
    planListMode,
    setPlanListMode,
    editorOpen,
    editingPlan,
    setEditorOpen,
    setEditingPlan,
    activePlan,
    activeSessionId,
    activeTimerInitialState,
    profileHeightCm,
    profileWeightKg,
    profileGoal,
    profileSaving,
    profileNotice,
    handleProfileHeightChange,
    handleProfileWeightChange,
    handleProfileGoalChange,
    handleSaveProfile,
    settings,
    weeklyGoalText,
    reminderHourText,
    reminderMinuteText,
    reminderCount,
    reminderLeadTexts,
    settingsSaving,
    settingsNotice,
    setWeeklyGoalText,
    setReminderHourText,
    setReminderMinuteText,
    setReminderCount,
    updateReminderLeadText,
    toggleGlobalWorkoutDay,
    setSettings,
    clearSettingsNotice,
    handleSaveSettings,
    handleExportBackup,
    handleImportBackup,
    backupBusy,
    feedbackOpen,
    feedbackNoteModalOpen,
    feedbackPlanName,
    feedbackRating,
    feedbackComment,
    feedbackSaving,
    setFeedbackRating,
    setFeedbackComment,
    setFeedbackNoteModalOpen,
    setFeedbackOpen,
    handleSubmitFeedback,
    openCreatePlan,
    openEditPlan,
    handleSavePlan,
    handleDeletePlan,
    handleSharePlan,
    handleImportPlan,
    handleDeleteHistoryEntry,
    handleStartPlan,
    handleWorkoutComplete,
    closeTimer,
    handleTimerStateChange,
    resumeInterruptedWorkout,
    endInterruptedWorkout,
    onCloseEditor,
    todayWorkoutPlans,
    refreshProfile,
    refreshSettings,
    isWorkoutFlowBusy,
    handleIncomingPlanUrl
  };
}

export function useWorkoutPlanLinkEffect(
  ready: boolean,
  handleIncomingPlanUrl: (url: string) => void
) {
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
}
