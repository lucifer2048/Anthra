import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import "./global.css";
import { PlanEditorModal } from "./src/components/PlanEditorModal";
import { ProgressBar } from "./src/components/ProgressBar";
import { STREAK_CARD_HEIGHT, STREAK_CARD_WIDTH, StreakCard } from "./src/components/StreakCard";
import { TimerScreen } from "./src/components/TimerScreen";
import {
  deletePlan,
  finalizeWorkoutSession,
  getDashboardStats,
  getPlans,
  getUserProfile,
  getUserSettings,
  getWorkoutHistory,
  initDatabase,
  logWorkoutCompletion,
  savePlan,
  saveWorkoutSessionFeedback,
  saveUserProfile,
  saveUserSettings,
  startWorkoutSession
} from "./src/db";
import { WEEKDAY_OPTIONS, formatDays, matchesDay, normalizeDays } from "./src/constants/schedule";
import type {
  DashboardStats,
  UserProfile,
  UserSettings,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput,
  WorkoutRunSummary
} from "./src/types";
import { syncWorkoutReminders } from "./src/utils/reminders";

type DashboardTab = "home" | "plans" | "history" | "profile" | "settings";

const INITIAL_STATS: DashboardStats = {
  currentStreak: 0,
  streakWeeks: 0,
  weekCompleted: 0,
  weekGoal: 4
};

const INITIAL_SETTINGS: UserSettings = {
  workoutDays: [1, 3, 5],
  weeklyGoal: 4,
  reminderHour: 18,
  reminderMinute: 0,
  reminderLeadMinutes: [60],
  notificationsEnabled: false
};

function formatHistoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
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

function formatTimeLabel(hour: number, minute: number): string {
  const date = new Date(0);
  date.setHours(hour, minute, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [launchDelayDone, setLaunchDelayDone] = useState(false);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
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
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const shareCardRef = useRef<View>(null);
  const completionLoggedRef = useRef(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;

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

  const bootstrap = useCallback(async () => {
    await initDatabase();
    const [, , nextSettings] = await Promise.all([refreshData(), refreshProfile(), refreshSettings()]);
    await syncWorkoutReminders(nextSettings).catch(() => undefined);
    setReady(true);
  }, [refreshData, refreshProfile, refreshSettings]);

  useEffect(() => {
    bootstrap().catch((error) => {
      const message = error instanceof Error ? error.message : "Failed to start app.";
      Alert.alert("Startup error", message);
    });
  }, [bootstrap]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLaunchDelayDone(true);
    }, 4000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!ready || !launchDelayDone || !showSplashOverlay) return;
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 420,
      useNativeDriver: true
    }).start(() => {
      setShowSplashOverlay(false);
    });
  }, [launchDelayDone, ready, showSplashOverlay, splashOpacity]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      refreshDashboard().catch(() => undefined);
      refreshHistory().catch(() => undefined);
    }, 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshDashboard().catch(() => undefined);
        refreshHistory().catch(() => undefined);
        refreshSettings().catch(() => undefined);
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [ready, refreshDashboard, refreshHistory, refreshSettings]);

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
    await refreshData();
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
          await refreshData();
        }
      }
    ]);
  };

  const handleStartPlan = async (plan: WorkoutPlan) => {
    try {
      const sessionId = await startWorkoutSession(plan.id, plan.name);
      completionLoggedRef.current = false;
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
    await refreshDashboard();
    await refreshHistory();
  };

  const openSessionFeedback = useCallback((sessionId: number, planName: string) => {
    setFeedbackSessionId(sessionId);
    setFeedbackPlanName(planName);
    setFeedbackRating(0);
    setFeedbackComment("");
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

  const handleShare = async () => {
    if (!shareCardRef.current) return;
    const shareAvailable = await Sharing.isAvailableAsync();
    if (!shareAvailable) {
      Alert.alert("Not available", "Sharing is not available on this device.");
      return;
    }
    const uri = await captureRef(shareCardRef, {
      format: "png",
      quality: 1,
      width: STREAK_CARD_WIDTH,
      height: STREAK_CARD_HEIGHT
    });
    await Sharing.shareAsync(uri, {
      dialogTitle: "Share your Anthra streak",
      mimeType: "image/png"
    });
  };

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
        notificationsEnabled: settings.notificationsEnabled
      };

      await saveUserSettings(payload);
      setSettings(payload);
      setWeeklyGoalText(String(payload.weeklyGoal));
      setReminderHourText(String(payload.reminderHour));
      setReminderMinuteText(String(payload.reminderMinute));
      setReminderLeadTexts(ensureThreeLeadInputs(payload.reminderLeadMinutes));
      setReminderCount(Math.min(3, Math.max(1, payload.reminderLeadMinutes.length)));
      await refreshDashboard();

      const reminderResult = await syncWorkoutReminders(payload);
      const reminderFailure =
        !reminderResult.supported || reminderResult.message.toLowerCase().startsWith("reminder sync failed");
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

  const reminderPreview = useMemo(() => {
    const hour = parseStrictWholeNumber(reminderHourText);
    const minute = parseStrictWholeNumber(reminderMinuteText);
    if (hour == null || hour < 0 || hour > 23 || minute == null || minute < 0 || minute > 59) {
      return "Enter valid hour (0-23) and minute (0-59)";
    }

    const parsedLeadMinutes: number[] = [];
    for (let index = 0; index < reminderCount; index += 1) {
      const leadValue = parseStrictWholeNumber(reminderLeadTexts[index] ?? "");
      if (leadValue == null || leadValue < 0 || leadValue > 720) {
        return `Enter reminder lead times between 0 and 720 minutes`;
      }
      parsedLeadMinutes.push(leadValue);
    }

    const leadMinutes = normalizeReminderLeadMinutes(parsedLeadMinutes);
    const previewLeads = leadMinutes.length > 0 ? leadMinutes : [60];
    return `${formatTimeLabel(hour, minute)} workout time, remind ${previewLeads.join(", ")} min before`;
  }, [
    reminderHourText,
    reminderMinuteText,
    reminderCount,
    reminderLeadTexts,
    settings.reminderHour,
    settings.reminderMinute,
    settings.reminderLeadMinutes
  ]);

  const closeTimer = async (summary: WorkoutRunSummary) => {
    const finishedSessionId = activeSessionId;
    const finishedPlanName = activePlan?.name ?? "Workout";
    try {
      await finalizeCurrentSession(summary);
    } finally {
      setActivePlan(null);
      setActiveSessionId(null);
      await refreshData();
      if (summary.completed && finishedSessionId) {
        openSessionFeedback(finishedSessionId, finishedPlanName);
      }
    }
  };

  const tabTitle =
    activeTab === "home"
      ? "Overview"
      : activeTab === "plans"
        ? "Workout Plans"
        : activeTab === "history"
          ? "History"
          : activeTab === "profile"
            ? "Profile"
            : "Settings";

  const currentWeekday = new Date().getDay();
  const isWorkoutDayToday = matchesDay(settings.workoutDays, currentWeekday);
  const workoutDaysLabel = useMemo(() => formatDays(settings.workoutDays), [settings.workoutDays]);
  const todaysPlans = useMemo(
    () => plans.filter((plan) => matchesDay(plan.workoutDays, currentWeekday)),
    [currentWeekday, plans]
  );
  const quickStartPlan = isWorkoutDayToday ? (todaysPlans[0] ?? null) : null;

  const heightCm = parsePositiveNumber(profileHeightCm);
  const weightKg = parsePositiveNumber(profileWeightKg);
  const bmi =
    heightCm != null && weightKg != null ? weightKg / Math.pow(Math.max(0.1, heightCm / 100), 2) : null;
  const roundedBmi = bmi != null ? Math.round(bmi * 10) / 10 : null;

  const bmiSummary = useMemo(() => {
    if (roundedBmi == null) {
      return {
        label: "Add your metrics",
        note: "Enter height and weight to calculate BMI.",
        textClass: "text-white",
        badgeClass: "bg-white/10",
        badgeTextClass: "text-white/80"
      };
    }
    if (roundedBmi < 18.5) {
      return {
        label: "Underweight",
        note: "BMI below 18.5",
        textClass: "text-neon-amber",
        badgeClass: "bg-neon-amber/20",
        badgeTextClass: "text-neon-amber"
      };
    }
    if (roundedBmi < 25) {
      return {
        label: "Healthy Range",
        note: "BMI between 18.5 and 24.9",
        textClass: "text-neon-green",
        badgeClass: "bg-neon-green/20",
        badgeTextClass: "text-neon-green"
      };
    }
    if (roundedBmi < 30) {
      return {
        label: "Overweight",
        note: "BMI between 25 and 29.9",
        textClass: "text-neon-red",
        badgeClass: "bg-neon-red/20",
        badgeTextClass: "text-neon-red"
      };
    }
    return {
      label: "Obesity",
      note: "BMI 30 and above",
      textClass: "text-neon-red",
      badgeClass: "bg-neon-red/20",
      badgeTextClass: "text-neon-red"
    };
  }, [roundedBmi]);

  let content;

  if (!ready) {
    content = (
      <View className="flex-1 bg-ink">
        <StatusBar style="light" />
      </View>
    );
  } else if (activePlan) {
    content = (
      <GestureHandlerRootView className="flex-1">
        <StatusBar style="light" />
        <TimerScreen plan={activePlan} onComplete={handleWorkoutComplete} onBack={closeTimer} />
      </GestureHandlerRootView>
    );
  } else {
    content = (
      <GestureHandlerRootView className="flex-1 bg-ink">
        <StatusBar style="light" />
        <SafeAreaView className="flex-1 bg-ink" edges={["top", "bottom"]}>
          <View className="border-b border-white/10 px-5 pb-3 pt-7">
            <Text className="text-3xl font-black tracking-[3px] text-neon-blue">ANTHRA</Text>
            <Text className="mt-1 text-base font-black text-white">{tabTitle}</Text>
          </View>

          <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: 24 }}>
            {activeTab === "home" && (
              <>
                {quickStartPlan && (
                  <Pressable
                    onPress={() => handleStartPlan(quickStartPlan)}
                    className="rounded-3xl border border-neon-green/50 bg-neon-green/20 py-5"
                  >
                    <Text className="text-center text-xs font-bold uppercase tracking-[2px] text-neon-green">
                      Quick Start
                    </Text>
                    <Text className="mt-1 text-center text-3xl font-black text-white">Let's Begin</Text>
                    <Text className="mt-1 text-center text-sm text-white/70">{quickStartPlan.name}</Text>
                    <Text className="mt-1 text-center text-xs font-semibold uppercase tracking-[1.5px] text-white/60">
                      {formatDays(quickStartPlan.workoutDays)}
                    </Text>
                  </Pressable>
                )}

                {!quickStartPlan && (
                  <View className="rounded-3xl border border-white/15 bg-panel p-5">
                    <Text className="text-xs font-bold uppercase tracking-[2px] text-white/60">Quick Start</Text>
                    <Text className="mt-2 text-xl font-black text-white">
                      {isWorkoutDayToday ? "No plan for today" : "Rest day"}
                    </Text>
                    <Text className="mt-2 text-sm text-white/70">
                      {isWorkoutDayToday
                        ? "Assign workout days inside each plan so Anthra can pick today's session."
                        : `Today is not in your workout schedule (${workoutDaysLabel}).`}
                    </Text>
                    <Pressable
                      onPress={() => setActiveTab(isWorkoutDayToday ? "plans" : "settings")}
                      className="mt-4 rounded-xl bg-neon-blue py-3"
                    >
                      <Text className="text-center font-black text-ink">
                        {isWorkoutDayToday ? "Plan Today" : "Edit Schedule"}
                      </Text>
                    </Pressable>
                  </View>
                )}

                <View className="mt-5 rounded-3xl border border-white/10 bg-panel p-5">
                  <Text className="text-sm font-semibold uppercase tracking-[3px] text-white/60">
                    Current Streak
                  </Text>
                  <Text className="mt-2 text-6xl font-black text-neon-green">{stats.currentStreak}</Text>
                  <Text className="text-base font-semibold text-white">days</Text>
                  <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px] text-white/60">
                    {stats.streakWeeks > 0
                      ? `Since ${stats.streakWeeks} week${stats.streakWeeks === 1 ? "" : "s"}`
                      : "Started this week"}
                  </Text>

                  <View className="mt-5">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-white/70">This week</Text>
                      <Text className="text-sm font-semibold text-white/90">
                        {stats.weekCompleted}/{stats.weekGoal}
                      </Text>
                    </View>
                    <ProgressBar value={stats.weekCompleted} max={stats.weekGoal} />
                  </View>

                  <Pressable onPress={handleShare} className="mt-5 rounded-2xl bg-neon-blue py-3">
                    <Text className="text-center text-base font-black text-ink">Share Streak Card</Text>
                  </Pressable>
                </View>

                <View className="mt-5 flex-row gap-3">
                  <View className="flex-1 rounded-2xl border border-white/10 bg-panel p-4">
                    <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/60">Plans</Text>
                    <Text className="mt-1 text-3xl font-black text-white">{plans.length}</Text>
                  </View>
                  <View className="flex-1 rounded-2xl border border-white/10 bg-panel p-4">
                    <Text className="text-xs font-semibold uppercase tracking-[2px] text-white/60">Sessions</Text>
                    <Text className="mt-1 text-3xl font-black text-white">{history.length}</Text>
                  </View>
                </View>
              </>
            )}

            {activeTab === "plans" && (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="text-2xl font-black text-white">Your Plans</Text>
                  <Pressable onPress={openCreatePlan} className="rounded-xl bg-neon-green px-4 py-2">
                    <Text className="font-black text-ink">New</Text>
                  </Pressable>
                </View>

                {plans.length === 0 && (
                  <View className="mt-4 rounded-2xl border border-dashed border-white/20 bg-panel p-4">
                    <Text className="text-sm text-white/70">
                      Create your first plan to unlock the timer flow.
                    </Text>
                  </View>
                )}

                {plans.map((plan) => {
                  const setCount = plan.sections.length;
                  const exerciseCount = plan.sections.reduce(
                    (total, section) => total + section.exercises.length,
                    0
                  );

                  return (
                    <Swipeable
                      key={plan.id}
                      renderRightActions={() => (
                        <Pressable
                          onPress={() => handleDeletePlan(plan)}
                          className="ml-3 mt-4 items-center justify-center rounded-2xl bg-neon-red px-6"
                        >
                          <Text className="font-bold text-white">Delete</Text>
                        </Pressable>
                      )}
                    >
                      <View className="mt-4 rounded-2xl border border-white/10 bg-panel p-4">
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 pr-3">
                            <Text className="text-lg font-bold text-white">{plan.name}</Text>
                            <Text className="mt-1 text-sm text-white/65">
                              {setCount} set(s) • {exerciseCount} exercise(s)
                            </Text>
                            <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px] text-white/55">
                              {formatDays(plan.workoutDays)}
                            </Text>
                          </View>
                          <Pressable onPress={() => openEditPlan(plan)}>
                            <Text className="font-semibold text-neon-blue">Edit</Text>
                          </Pressable>
                        </View>
                        <Pressable
                          onPress={() => handleStartPlan(plan)}
                          className="mt-4 rounded-xl bg-neon-green py-3"
                        >
                          <Text className="text-center text-base font-black text-ink">Let's Begin</Text>
                        </Pressable>
                      </View>
                    </Swipeable>
                  );
                })}
              </>
            )}

            {activeTab === "history" && (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="text-2xl font-black text-white">Workout History</Text>
                  <Text className="text-sm font-semibold text-white/60">{history.length} sessions</Text>
                </View>

                {history.length === 0 && (
                  <View className="mt-4 rounded-2xl border border-dashed border-white/20 bg-panel p-4">
                    <Text className="text-sm text-white/70">No workout history yet. Start your first session.</Text>
                  </View>
                )}

                {history.map((entry) => (
                  <View key={entry.id} className="mt-4 rounded-2xl border border-white/10 bg-panel p-4">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-base font-bold text-white">{entry.planName}</Text>
                        <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px] text-white/60">
                          {formatHistoryDate(entry.startedAt)}
                        </Text>
                      </View>
                      <View
                        className={`rounded-lg px-2 py-1 ${
                          entry.completed ? "bg-neon-green/25" : "bg-neon-amber/25"
                        }`}
                      >
                        <Text
                          className={`text-xs font-black uppercase ${
                            entry.completed ? "text-neon-green" : "text-neon-amber"
                          }`}
                        >
                          {entry.completed ? "Completed" : "Partial"}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-3">
                      <View className="mb-1 flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-white/70">Progress</Text>
                        <Text className="text-sm font-semibold text-white/90">
                          {Math.round(entry.progressPercent)}%
                        </Text>
                      </View>
                      <ProgressBar value={entry.progressPercent} max={100} />
                    </View>

                    <Text className="mt-2 text-xs text-white/65">
                      {entry.completedSegments}/{entry.totalSegments} segments • {formatDuration(entry.elapsedSeconds)}
                    </Text>

                    {entry.rating != null && (
                      <Text className="mt-2 text-xs font-semibold uppercase tracking-[1.2px] text-neon-amber">
                        {"*".repeat(entry.rating)} ({entry.rating}/5)
                      </Text>
                    )}

                    {entry.comment.trim().length > 0 && (
                      <View className="mt-2 rounded-xl border border-white/10 bg-ink px-3 py-2">
                        <Text className="text-xs text-white/75">{entry.comment}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {activeTab === "profile" && (
              <>
                <View className="rounded-3xl border border-white/10 bg-panel p-5">
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-white/60">Body Metrics</Text>
                  <View className="mt-4 flex-row gap-3">
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-white/65">Height (cm)</Text>
                      <TextInput
                        value={profileHeightCm}
                        onChangeText={handleProfileHeightChange}
                        keyboardType="decimal-pad"
                        placeholder="170"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base font-semibold text-white"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-white/65">Weight (kg)</Text>
                      <TextInput
                        value={profileWeightKg}
                        onChangeText={handleProfileWeightChange}
                        keyboardType="decimal-pad"
                        placeholder="70"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base font-semibold text-white"
                      />
                    </View>
                  </View>
                </View>

                <View className="mt-4 rounded-3xl border border-white/10 bg-panel p-5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold uppercase tracking-[2px] text-white/60">BMI</Text>
                    <View className={`rounded-full px-3 py-1 ${bmiSummary.badgeClass}`}>
                      <Text className={`text-xs font-black uppercase ${bmiSummary.badgeTextClass}`}>
                        {bmiSummary.label}
                      </Text>
                    </View>
                  </View>
                  <Text className={`mt-3 text-6xl font-black ${bmiSummary.textClass}`}>
                    {roundedBmi != null ? roundedBmi : "--"}
                  </Text>
                  <Text className="mt-2 text-sm text-white/70">{bmiSummary.note}</Text>
                </View>

                <View className="mt-4 rounded-3xl border border-white/10 bg-panel p-5">
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-white/60">Goals</Text>
                  <TextInput
                    value={profileGoal}
                    onChangeText={handleProfileGoalChange}
                    multiline
                    textAlignVertical="top"
                    placeholder="Example: Reach 68kg and train 4 days/week."
                    placeholderTextColor="#7A7A7A"
                    className="mt-3 min-h-[120px] rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base text-white"
                  />
                </View>

                <Pressable
                  onPress={handleSaveProfile}
                  className="mt-5 items-center rounded-2xl bg-neon-blue py-4"
                  disabled={profileSaving}
                >
                  <Text className="text-base font-black text-ink">{profileSaving ? "Saving..." : "Save Profile"}</Text>
                </Pressable>

                {profileNotice && (
                  <View
                    className={`mt-3 rounded-2xl border px-4 py-3 ${
                      profileNotice.type === "success"
                        ? "border-neon-green/40 bg-neon-green/15"
                        : "border-neon-red/40 bg-neon-red/15"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        profileNotice.type === "success" ? "text-neon-green" : "text-neon-red"
                      }`}
                    >
                      {profileNotice.message}
                    </Text>
                  </View>
                )}
              </>
            )}

            {activeTab === "settings" && (
              <>
                <View className="rounded-3xl border border-white/10 bg-panel p-5">
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-white/60">
                    Workout Schedule
                  </Text>
                  <Text className="mt-2 text-sm text-white/70">
                    Active days: {workoutDaysLabel}. Select the days you plan to train.
                  </Text>

                  <View className="mt-4 flex-row flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const isActive = settings.workoutDays.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          onPress={() => toggleGlobalWorkoutDay(day.value)}
                          className={`rounded-full border px-3 py-2 ${
                            isActive ? "border-neon-blue bg-neon-blue/25" : "border-white/20 bg-ink"
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold uppercase ${
                              isActive ? "text-neon-blue" : "text-white/75"
                            }`}
                          >
                            {day.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View className="mt-5">
                    <Text className="mb-2 text-xs font-semibold text-white/65">Weekly Streak Goal (1-7)</Text>
                    <TextInput
                      value={weeklyGoalText}
                      onChangeText={(value) => {
                        if (settingsNotice) setSettingsNotice(null);
                        setWeeklyGoalText(digitsOnly(value));
                      }}
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor="#7A7A7A"
                      className="rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base font-semibold text-white"
                    />
                    <Text className="mt-2 text-xs text-white/60">
                      Streak increments when completed workout days reach this weekly goal.
                    </Text>
                  </View>
                </View>

                <View className="mt-4 rounded-3xl border border-white/10 bg-panel p-5">
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-white/60">
                    Reminder Settings
                  </Text>
                  <Text className="mt-2 text-sm text-white/70">
                    Choose workout time and set up to 3 reminder intervals.
                  </Text>

                  <Pressable
                    onPress={() => {
                      if (settingsNotice) setSettingsNotice(null);
                      setSettings((prev) => ({
                        ...prev,
                        notificationsEnabled: !prev.notificationsEnabled
                      }));
                    }}
                    className={`mt-4 rounded-2xl border px-4 py-3 ${
                      settings.notificationsEnabled
                        ? "border-neon-green/50 bg-neon-green/15"
                        : "border-white/20 bg-ink"
                    }`}
                  >
                    <Text
                      className={`text-sm font-black uppercase ${
                        settings.notificationsEnabled ? "text-neon-green" : "text-white/75"
                      }`}
                    >
                      {settings.notificationsEnabled ? "Reminders On" : "Reminders Off"}
                    </Text>
                  </Pressable>

                  <View className="mt-4 flex-row gap-3">
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-white/65">Hour (0-23)</Text>
                      <TextInput
                        value={reminderHourText}
                        onChangeText={(value) => {
                          if (settingsNotice) setSettingsNotice(null);
                          setReminderHourText(digitsOnly(value));
                        }}
                        keyboardType="number-pad"
                        placeholder="18"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base font-semibold text-white"
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-white/65">Minute (0-59)</Text>
                      <TextInput
                        value={reminderMinuteText}
                        onChangeText={(value) => {
                          if (settingsNotice) setSettingsNotice(null);
                          setReminderMinuteText(digitsOnly(value));
                        }}
                        keyboardType="number-pad"
                        placeholder="00"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base font-semibold text-white"
                      />
                    </View>
                  </View>

                  <View className="mt-4">
                    <Text className="mb-2 text-xs font-semibold text-white/65">How many reminders?</Text>
                    <View className="flex-row gap-2">
                      {[1, 2, 3].map((count) => {
                        const active = reminderCount === count;
                        return (
                          <Pressable
                            key={count}
                            onPress={() => {
                              if (settingsNotice) setSettingsNotice(null);
                              setReminderCount(count);
                            }}
                            className={`flex-1 items-center rounded-xl border py-2 ${
                              active ? "border-neon-blue bg-neon-blue/20" : "border-white/20 bg-ink"
                            }`}
                          >
                            <Text className={`text-sm font-black ${active ? "text-neon-blue" : "text-white/75"}`}>
                              {count}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="mt-4 gap-2">
                    {Array.from({ length: reminderCount }).map((_, index) => (
                      <View key={`lead-${index}`}>
                        <Text className="mb-1 text-xs font-semibold text-white/65">
                          Reminder {index + 1} lead (0-720 min before)
                        </Text>
                        <TextInput
                          value={reminderLeadTexts[index] ?? ""}
                          onChangeText={(value) => updateReminderLeadText(index, value)}
                          keyboardType="number-pad"
                          placeholder={index === 0 ? "30" : index === 1 ? "15" : "5"}
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border border-white/10 bg-ink px-4 py-3 text-base font-semibold text-white"
                        />
                      </View>
                    ))}
                  </View>

                  <Text className="mt-3 text-xs font-semibold uppercase tracking-[1.5px] text-white/60">
                    {reminderPreview}
                  </Text>
                </View>

                <Pressable
                  onPress={handleSaveSettings}
                  className="mt-5 items-center rounded-2xl bg-neon-blue py-4"
                  disabled={settingsSaving}
                >
                  <Text className="text-base font-black text-ink">
                    {settingsSaving ? "Saving..." : "Save Settings"}
                  </Text>
                </Pressable>

                {settingsNotice && (
                  <View
                    className={`mt-3 rounded-2xl border px-4 py-3 ${
                      settingsNotice.type === "success"
                        ? "border-neon-green/40 bg-neon-green/15"
                        : "border-neon-red/40 bg-neon-red/15"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        settingsNotice.type === "success" ? "text-neon-green" : "text-neon-red"
                      }`}
                    >
                      {settingsNotice.message}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View className="border-t border-white/10 bg-ink px-4 pb-4 pt-3">
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setActiveTab("home")}
                className={`flex-1 items-center rounded-xl py-3 ${
                  activeTab === "home" ? "bg-neon-blue" : "bg-panel"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${activeTab === "home" ? "text-ink" : "text-white/75"}`}
                >
                  Home
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("plans")}
                className={`flex-1 items-center rounded-xl py-3 ${
                  activeTab === "plans" ? "bg-neon-blue" : "bg-panel"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${activeTab === "plans" ? "text-ink" : "text-white/75"}`}
                >
                  Plans
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("history")}
                className={`flex-1 items-center rounded-xl py-3 ${
                  activeTab === "history" ? "bg-neon-blue" : "bg-panel"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${activeTab === "history" ? "text-ink" : "text-white/75"}`}
                >
                  History
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("profile")}
                className={`flex-1 items-center rounded-xl py-3 ${
                  activeTab === "profile" ? "bg-neon-blue" : "bg-panel"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${activeTab === "profile" ? "text-ink" : "text-white/75"}`}
                >
                  Profile
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("settings")}
                className={`flex-1 items-center rounded-xl py-3 ${
                  activeTab === "settings" ? "bg-neon-blue" : "bg-panel"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${activeTab === "settings" ? "text-ink" : "text-white/75"}`}
                >
                  Settings
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>

        <View className="absolute -left-[2000px] -top-[2000px]">
          <View ref={shareCardRef} collapsable={false}>
            <StreakCard
              streakDays={stats.currentStreak}
              streakWeeks={stats.streakWeeks}
              weekCompleted={stats.weekCompleted}
              weekGoal={stats.weekGoal}
            />
          </View>
        </View>

        <PlanEditorModal
          visible={editorOpen}
          initialPlan={editingPlan}
          defaultWorkoutDays={settings.workoutDays}
          onClose={() => {
            setEditorOpen(false);
            setEditingPlan(null);
          }}
          onSave={handleSavePlan}
        />

        <Modal
          visible={feedbackOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!feedbackSaving) setFeedbackOpen(false);
          }}
        >
          <View className="flex-1 justify-center bg-black/70 px-6">
            <View className="rounded-3xl border border-white/15 bg-panel p-5">
              <Text className="text-xl font-black text-white">Rate Session</Text>
              <Text className="mt-2 text-sm text-white/70">
                {feedbackPlanName} is complete. Add a quick rating and optional note for your history.
              </Text>

              <View className="mt-4 flex-row justify-between rounded-2xl border border-white/10 bg-ink px-3 py-3">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = feedbackRating >= star;
                  return (
                    <Pressable
                      key={`rating-${star}`}
                      onPress={() => setFeedbackRating(star)}
                      className={`h-11 w-11 items-center justify-center rounded-xl ${
                        active ? "bg-neon-amber/25" : "bg-panel"
                      }`}
                    >
                      <Text className={`text-xl font-black ${active ? "text-neon-amber" : "text-white/40"}`}>
                        *
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={feedbackComment}
                onChangeText={setFeedbackComment}
                multiline
                textAlignVertical="top"
                maxLength={400}
                placeholder="How did this session feel? (optional)"
                placeholderTextColor="#7A7A7A"
                className="mt-4 min-h-[110px] rounded-2xl border border-white/10 bg-ink px-4 py-3 text-sm text-white"
              />

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setFeedbackOpen(false)}
                  className="flex-1 items-center rounded-xl border border-white/20 bg-ink py-3"
                  disabled={feedbackSaving}
                >
                  <Text className="font-semibold text-white/75">Later</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitFeedback}
                  className="flex-1 items-center rounded-xl bg-neon-green py-3"
                  disabled={feedbackSaving}
                >
                  <Text className="font-black text-ink">{feedbackSaving ? "Saving..." : "Save Feedback"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </GestureHandlerRootView>
    );
  }

  return (
    <SafeAreaProvider>
      <View className="flex-1">
        {content}
        {showSplashOverlay && (
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: splashOpacity
            }}
          >
            <View className="flex-1 items-center justify-center bg-ink px-8">
              <StatusBar style="light" />
              <View className="w-full max-w-[360px] rounded-3xl border border-white/10 bg-panel px-8 py-10">
                <View className="items-center">
                  <Image
                    source={require("./assets/icons/icon.png")}
                    className="h-24 w-24 rounded-3xl"
                    resizeMode="cover"
                  />
                  <Text className="mt-5 text-4xl font-black tracking-[4px] text-neon-blue">ANTHRA</Text>
                  <Text className="mt-2 text-sm font-semibold uppercase tracking-[2px] text-white/70">
                    Personal Workout Planner
                  </Text>
                  <View className="mt-8 items-center">
                    <ActivityIndicator size="large" color="#52B7FF" />
                    <Text className="mt-4 text-xs font-semibold uppercase tracking-[1.5px] text-white/60">
                      Crafting...
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </SafeAreaProvider>
  );
}
