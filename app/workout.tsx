import { useEffect } from "react";
import { useLocalSearchParams } from "expo-router";

import type { WorkoutTab } from "../src/components/WorkoutTabBar";
import { WorkoutBuddyScreen } from "../src/features/workout/WorkoutBuddyScreen";
import { useAppShell } from "../src/app-shell/AppShellContext";
import { goHub } from "../src/app-shell/navigation";

const WORKOUT_TABS: WorkoutTab[] = ["home", "plans", "history"];

export default function WorkoutRoute() {
  const params = useLocalSearchParams<{
    section?: string;
    tab?: string;
    planListMode?: string;
  }>();
  const shell = useAppShell();

  const section =
    params.section === "profile" || params.section === "settings" ? params.section : "workout";
  const tab = WORKOUT_TABS.includes(params.tab as WorkoutTab)
    ? (params.tab as WorkoutTab)
    : shell.activeTab;
  const planListMode = params.planListMode === "today" ? "today" : shell.planListMode;

  const { setActiveTab, setPlanListMode } = shell;

  useEffect(() => {
    if (params.tab && WORKOUT_TABS.includes(params.tab as WorkoutTab)) {
      setActiveTab(params.tab as WorkoutTab);
    }
    if (params.planListMode === "today" || params.planListMode === "all") {
      setPlanListMode(params.planListMode);
    }
  }, [params.planListMode, params.tab, setActiveTab, setPlanListMode]);

  return (
    <WorkoutBuddyScreen
      onBack={goHub}
      section={section}
      activeTab={tab}
      onTabChange={shell.setActiveTab}
      planListMode={planListMode}
      onPlanListModeChange={shell.setPlanListMode}
      plans={shell.plans}
      stats={shell.stats}
      history={shell.history}
      settings={shell.settings}
      profileHeightCm={shell.profileHeightCm}
      profileWeightKg={shell.profileWeightKg}
      profileGoal={shell.profileGoal}
      onProfileHeightChange={shell.handleProfileHeightChange}
      onProfileWeightChange={shell.handleProfileWeightChange}
      onProfileGoalChange={shell.handleProfileGoalChange}
      onSaveProfile={() => {
        shell.handleSaveProfile().catch(() => undefined);
      }}
      profileSaving={shell.profileSaving}
      profileNotice={shell.profileNotice}
      weeklyGoalText={shell.weeklyGoalText}
      reminderHourText={shell.reminderHourText}
      reminderMinuteText={shell.reminderMinuteText}
      reminderCount={shell.reminderCount}
      reminderLeadTexts={shell.reminderLeadTexts}
      onWeeklyGoalTextChange={shell.setWeeklyGoalText}
      onReminderHourTextChange={shell.setReminderHourText}
      onReminderMinuteTextChange={shell.setReminderMinuteText}
      onReminderCountChange={shell.setReminderCount}
      onReminderLeadTextChange={shell.updateReminderLeadText}
      onToggleGlobalWorkoutDay={shell.toggleGlobalWorkoutDay}
      onSettingsChange={shell.setSettings}
      onClearSettingsNotice={shell.clearSettingsNotice}
      onSaveSettings={() => {
        shell.handleSaveSettings().catch(() => undefined);
      }}
      settingsSaving={shell.settingsSaving}
      settingsNotice={shell.settingsNotice}
      onExportBackup={() => {
        shell.handleExportBackup().catch(() => undefined);
      }}
      onImportBackup={() => {
        shell.handleImportBackup().catch(() => undefined);
      }}
      backupBusy={shell.backupBusy}
      onStartPlan={(plan) => {
        shell.handleStartPlan(plan).catch(() => undefined);
      }}
      onCreatePlan={shell.openCreatePlan}
      onEditPlan={shell.openEditPlan}
      onDeletePlan={shell.handleDeletePlan}
      onSharePlan={(plan) => {
        shell.handleSharePlan(plan).catch(() => undefined);
      }}
      onImportPlan={shell.handleImportPlan}
      editorOpen={shell.editorOpen}
      editingPlan={shell.editingPlan}
      onCloseEditor={shell.onCloseEditor}
      onSavePlan={shell.handleSavePlan}
      onDeleteHistoryEntry={shell.handleDeleteHistoryEntry}
      keyboardBottomPadding={shell.keyboardSafeBottomPadding}
    />
  );
}
