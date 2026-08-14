import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { resolveTheme } from "../design-system";
import { getDeviceTimeZone } from "../utils/timezone";
import { AppShellContext } from "./AppShellContext";
import { INITIAL_SETTINGS, resolveModuleTheme } from "./constants";
import { useAppBootstrap, type SyncAllNotificationsFn } from "./hooks/useAppBootstrap";
import { useAppNavigationHandlers } from "./hooks/useAppNavigationHandlers";
import { useAppShellUi } from "./hooks/useAppShellUi";
import { useNotificationSync } from "./hooks/useNotificationSync";
import { useWorkoutPlanLinkEffect, useWorkoutShell } from "./hooks/useWorkoutShell";
import type { UserSettings } from "../types";

export { INITIAL_STATS, resolveModuleTheme } from "./constants";
export { AppShellChrome } from "./AppShellChrome";

export function AppShellProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const workoutFlowBusyRef = useRef(false);
  const syncAllNotificationsRef = useRef<SyncAllNotificationsFn>(async () => false);
  const refreshProfileRef = useRef<() => Promise<void>>(async () => {});
  const refreshSettingsRef = useRef<() => Promise<UserSettings>>(async () => INITIAL_SETTINGS);
  const promptForWorkoutAlarmPermissionRef = useRef<() => Promise<boolean>>(async () => false);

  const syncAllNotificationsProxy = useCallback<SyncAllNotificationsFn>(
    (nextSettings, nextPlans, force) => syncAllNotificationsRef.current(nextSettings, nextPlans, force),
    []
  );
  const refreshProfileProxy = useCallback(() => refreshProfileRef.current(), []);
  const refreshSettingsProxy = useCallback(() => refreshSettingsRef.current(), []);
  const promptForWorkoutAlarmPermissionProxy = useCallback(
    () => promptForWorkoutAlarmPermissionRef.current(),
    []
  );

  const bootstrap = useAppBootstrap({
    syncAllNotifications: syncAllNotificationsProxy,
    refreshProfile: refreshProfileProxy,
    refreshSettings: refreshSettingsProxy
  });

  const workout = useWorkoutShell({
    plans: bootstrap.plans,
    recoverableWorkout: bootstrap.recoverableWorkout,
    setRecoverableWorkout: bootstrap.setRecoverableWorkout,
    refreshData: bootstrap.refreshData,
    refreshDashboard: bootstrap.refreshDashboard,
    refreshHistory: bootstrap.refreshHistory,
    refreshEnabledReminderCount: bootstrap.refreshEnabledReminderCount,
    syncAllNotifications: syncAllNotificationsProxy,
    promptForWorkoutAlarmPermission: promptForWorkoutAlarmPermissionProxy,
    setThemeMode: bootstrap.setThemeMode,
    setShowSplashOverlay: bootstrap.setShowSplashOverlay,
    deviceTimeZone,
    workoutFlowBusyRef
  });

  refreshProfileRef.current = workout.refreshProfile;
  refreshSettingsRef.current = workout.refreshSettings;

  const notification = useNotificationSync({
    ready: bootstrap.ready,
    settings: workout.settings,
    plans: bootstrap.plans,
    refreshData: bootstrap.refreshData,
    refreshSettings: workout.refreshSettings,
    refreshDashboard: bootstrap.refreshDashboard,
    refreshHistory: bootstrap.refreshHistory,
    refreshEnabledReminderCount: bootstrap.refreshEnabledReminderCount,
    workoutFlowBusyRef,
    isWorkoutFlowBusy: workout.isWorkoutFlowBusy
  });

  syncAllNotificationsRef.current = notification.syncAllNotifications;
  promptForWorkoutAlarmPermissionRef.current = notification.promptForWorkoutAlarmPermission;

  const ui = useAppShellUi();
  const navigation = useAppNavigationHandlers(ui.hubScrollOffsetRef);

  useWorkoutPlanLinkEffect(bootstrap.ready, workout.handleIncomingPlanUrl);

  const semanticTheme = resolveTheme(bootstrap.themeMode, systemColorScheme);
  const isDarkMode = semanticTheme.isDark;
  const appBackground = semanticTheme.colors.canvas;
  const moduleTheme = useMemo(() => resolveModuleTheme(isDarkMode), [isDarkMode]);

  const contextValue = useMemo(
    () => ({
      ready: bootstrap.ready,
      bootstrapError: bootstrap.bootstrapError,
      bootstrapAttempt: bootstrap.bootstrapAttempt,
      setBootstrapAttempt: bootstrap.setBootstrapAttempt,
      themeMode: bootstrap.themeMode,
      systemColorScheme,
      handleThemeModeChange: bootstrap.handleThemeModeChange,
      appBackground,
      moduleTheme,
      plans: bootstrap.plans,
      stats: bootstrap.stats,
      history: bootstrap.history,
      todayWorkoutPlans: workout.todayWorkoutPlans,
      enabledReminderCount: bootstrap.enabledReminderCount,
      recoverableWorkout: bootstrap.recoverableWorkout,
      activeTab: workout.activeTab,
      setActiveTab: workout.setActiveTab,
      planListMode: workout.planListMode,
      setPlanListMode: workout.setPlanListMode,
      editorOpen: workout.editorOpen,
      editingPlan: workout.editingPlan,
      setEditorOpen: workout.setEditorOpen,
      setEditingPlan: workout.setEditingPlan,
      activePlan: workout.activePlan,
      activeSessionId: workout.activeSessionId,
      activeTimerInitialState: workout.activeTimerInitialState,
      profileHeightCm: workout.profileHeightCm,
      profileWeightKg: workout.profileWeightKg,
      profileGoal: workout.profileGoal,
      profileSaving: workout.profileSaving,
      profileNotice: workout.profileNotice,
      handleProfileHeightChange: workout.handleProfileHeightChange,
      handleProfileWeightChange: workout.handleProfileWeightChange,
      handleProfileGoalChange: workout.handleProfileGoalChange,
      handleSaveProfile: workout.handleSaveProfile,
      settings: workout.settings,
      weeklyGoalText: workout.weeklyGoalText,
      reminderHourText: workout.reminderHourText,
      reminderMinuteText: workout.reminderMinuteText,
      reminderCount: workout.reminderCount,
      reminderLeadTexts: workout.reminderLeadTexts,
      settingsSaving: workout.settingsSaving,
      settingsNotice: workout.settingsNotice,
      setWeeklyGoalText: workout.setWeeklyGoalText,
      setReminderHourText: workout.setReminderHourText,
      setReminderMinuteText: workout.setReminderMinuteText,
      setReminderCount: workout.setReminderCount,
      updateReminderLeadText: workout.updateReminderLeadText,
      toggleGlobalWorkoutDay: workout.toggleGlobalWorkoutDay,
      setSettings: workout.setSettings,
      clearSettingsNotice: workout.clearSettingsNotice,
      handleSaveSettings: workout.handleSaveSettings,
      handleExportBackup: workout.handleExportBackup,
      handleImportBackup: workout.handleImportBackup,
      backupBusy: workout.backupBusy,
      feedbackOpen: workout.feedbackOpen,
      feedbackNoteModalOpen: workout.feedbackNoteModalOpen,
      feedbackPlanName: workout.feedbackPlanName,
      feedbackRating: workout.feedbackRating,
      feedbackComment: workout.feedbackComment,
      feedbackSaving: workout.feedbackSaving,
      setFeedbackRating: workout.setFeedbackRating,
      setFeedbackComment: workout.setFeedbackComment,
      setFeedbackNoteModalOpen: workout.setFeedbackNoteModalOpen,
      setFeedbackOpen: workout.setFeedbackOpen,
      handleSubmitFeedback: workout.handleSubmitFeedback,
      showSplashOverlay: bootstrap.showSplashOverlay,
      splashOpacity: bootstrap.splashOpacity,
      keyboardHeight: ui.keyboardHeight,
      keyboardSafeBottomPadding: ui.keyboardSafeBottomPadding,
      hubScrollOffsetRef: ui.hubScrollOffsetRef,
      handleHubCardsAnimated: ui.handleHubCardsAnimated,
      hasAnimatedHubCards: ui.hasAnimatedHubCardsRef.current,
      openCreatePlan: workout.openCreatePlan,
      openEditPlan: workout.openEditPlan,
      handleSavePlan: workout.handleSavePlan,
      handleDeletePlan: workout.handleDeletePlan,
      handleSharePlan: workout.handleSharePlan,
      handleImportPlan: workout.handleImportPlan,
      handleDeleteHistoryEntry: workout.handleDeleteHistoryEntry,
      handleStartPlan: workout.handleStartPlan,
      handleWorkoutComplete: workout.handleWorkoutComplete,
      closeTimer: workout.closeTimer,
      handleTimerStateChange: workout.handleTimerStateChange,
      resumeInterruptedWorkout: workout.resumeInterruptedWorkout,
      endInterruptedWorkout: workout.endInterruptedWorkout,
      onOpenWorkout: navigation.onOpenWorkout,
      onChooseTodayWorkout: navigation.onChooseTodayWorkout,
      onOpenActivity: navigation.onOpenActivity,
      onOpenNutrition: navigation.onOpenNutrition,
      onOpenReminders: navigation.onOpenReminders,
      onOpenTracker: navigation.onOpenTracker,
      onOpenLists: navigation.onOpenLists,
      onOpenAlarms: navigation.onOpenAlarms,
      onOpenVault: navigation.onOpenVault,
      onOpenProfile: navigation.onOpenProfile,
      onOpenSettings: navigation.onOpenSettings,
      onOpenAccount: navigation.onOpenAccount,
      onOpenFriends: navigation.onOpenFriends,
      onOpenFriendsLeaderboard: navigation.onOpenFriendsLeaderboard,
      onHubScrollOffsetChange: navigation.onHubScrollOffsetChange,
      onCloseEditor: workout.onCloseEditor,
      onOpenAccountFromFriends: navigation.onOpenAccountFromFriends,
      onReminderBack: navigation.onReminderBack
    }),
    [
      bootstrap.ready,
      bootstrap.bootstrapError,
      bootstrap.bootstrapAttempt,
      bootstrap.setBootstrapAttempt,
      bootstrap.themeMode,
      bootstrap.handleThemeModeChange,
      bootstrap.plans,
      bootstrap.stats,
      bootstrap.history,
      bootstrap.enabledReminderCount,
      bootstrap.recoverableWorkout,
      bootstrap.showSplashOverlay,
      bootstrap.splashOpacity,
      systemColorScheme,
      appBackground,
      moduleTheme,
      workout.todayWorkoutPlans,
      workout.activeTab,
      workout.planListMode,
      workout.editorOpen,
      workout.editingPlan,
      workout.activePlan,
      workout.activeSessionId,
      workout.activeTimerInitialState,
      workout.profileHeightCm,
      workout.profileWeightKg,
      workout.profileGoal,
      workout.profileSaving,
      workout.profileNotice,
      workout.settings,
      workout.weeklyGoalText,
      workout.reminderHourText,
      workout.reminderMinuteText,
      workout.reminderCount,
      workout.reminderLeadTexts,
      workout.settingsSaving,
      workout.settingsNotice,
      workout.updateReminderLeadText,
      workout.clearSettingsNotice,
      workout.handleSaveSettings,
      workout.handleExportBackup,
      workout.handleImportBackup,
      workout.backupBusy,
      workout.feedbackOpen,
      workout.feedbackNoteModalOpen,
      workout.feedbackPlanName,
      workout.feedbackRating,
      workout.feedbackComment,
      workout.feedbackSaving,
      workout.handleSubmitFeedback,
      ui.keyboardHeight,
      ui.keyboardSafeBottomPadding,
      ui.handleHubCardsAnimated,
      workout.handleSavePlan,
      workout.handleDeletePlan,
      workout.handleSharePlan,
      workout.handleImportPlan,
      workout.handleDeleteHistoryEntry,
      workout.handleStartPlan,
      workout.handleWorkoutComplete,
      workout.closeTimer,
      workout.handleTimerStateChange,
      workout.resumeInterruptedWorkout,
      workout.endInterruptedWorkout,
      navigation.onOpenWorkout,
      navigation.onChooseTodayWorkout,
      navigation.onOpenActivity,
      navigation.onOpenNutrition,
      navigation.onOpenReminders,
      navigation.onOpenTracker,
      navigation.onOpenLists,
      navigation.onOpenAlarms,
      navigation.onOpenVault,
      navigation.onOpenProfile,
      navigation.onOpenSettings,
      navigation.onOpenAccount,
      navigation.onOpenFriends,
      navigation.onOpenFriendsLeaderboard,
      navigation.onHubScrollOffsetChange,
      workout.onCloseEditor,
      navigation.onOpenAccountFromFriends,
      navigation.onReminderBack
    ]
  );

  return <AppShellContext.Provider value={contextValue}>{children}</AppShellContext.Provider>;
}
