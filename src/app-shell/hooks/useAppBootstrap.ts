import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

import { initAccountDatabase } from "../../features/account";
import { DEFAULT_THEME_MODE, type ThemeMode } from "../../design-system";
import {
  getActiveWorkoutSnapshot,
  getAppThemeMode,
  getDashboardStats,
  getPlans,
  getReminderItems,
  getWorkoutHistory,
  initDatabase,
  saveAppThemeMode
} from "../../db";
import type {
  ActiveWorkoutSnapshot,
  DashboardStats,
  UserSettings,
  WorkoutHistoryEntry,
  WorkoutPlan
} from "../../types";
import { INITIAL_STATS } from "../constants";

export type RefreshDataResult = {
  plans: WorkoutPlan[];
  stats: DashboardStats;
  history: WorkoutHistoryEntry[];
};

export type SyncAllNotificationsFn = (
  nextSettings: UserSettings,
  nextPlans: WorkoutPlan[],
  force?: boolean
) => Promise<boolean>;

type UseAppBootstrapParams = {
  syncAllNotifications: SyncAllNotificationsFn;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<UserSettings>;
};

export function useAppBootstrap({
  syncAllNotifications,
  refreshProfile,
  refreshSettings
}: UseAppBootstrapParams) {
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [recoverableWorkout, setRecoverableWorkout] = useState<ActiveWorkoutSnapshot | null>(null);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const [enabledReminderCount, setEnabledReminderCount] = useState(0);
  const splashOpacity = useRef(new Animated.Value(1)).current;

  const handleThemeModeChange = useCallback((nextMode: ThemeMode) => {
    setThemeMode(nextMode);
    saveAppThemeMode(nextMode).catch(() => undefined);
  }, []);

  const refreshDashboard = useCallback(async () => {
    const latestStats = await getDashboardStats();
    setStats(latestStats);
  }, []);

  const refreshHistory = useCallback(async () => {
    const latestHistory = await getWorkoutHistory();
    setHistory(latestHistory);
  }, []);

  const refreshData = useCallback(async (): Promise<RefreshDataResult> => {
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

  const refreshEnabledReminderCount = useCallback(async () => {
    const items = await getReminderItems();
    setEnabledReminderCount(items.filter((item) => item.enabled).length);
    return items;
  }, []);

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
  }, [
    refreshData,
    refreshEnabledReminderCount,
    refreshProfile,
    refreshSettings,
    syncAllNotifications
  ]);

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

  return {
    ready,
    bootstrapError,
    bootstrapAttempt,
    setBootstrapAttempt,
    themeMode,
    setThemeMode,
    handleThemeModeChange,
    plans,
    stats,
    history,
    recoverableWorkout,
    setRecoverableWorkout,
    showSplashOverlay,
    setShowSplashOverlay,
    splashOpacity,
    enabledReminderCount,
    refreshDashboard,
    refreshHistory,
    refreshData,
    refreshEnabledReminderCount
  };
}
