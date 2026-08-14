import { useMemo, useRef } from "react";
import {
  Alert,
  Platform,
  Text,
  type TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { ClipboardList, History, Share2, Star, Trash2 } from "lucide-react-native";

import { PlanEditorModal } from "../../components/PlanEditorModal";
import { ProgressBar } from "../../components/ProgressBar";
import { STREAK_CARD_HEIGHT, STREAK_CARD_WIDTH, StreakCard } from "../../components/StreakCard";
import { TimePickerField } from "../../components/TimePickerField";
import { AppearanceControl } from "../../components/AppearanceControl";
import { WorkoutTabBar, type WorkoutTab } from "../../components/WorkoutTabBar";
import { useScreenBackgrounds } from "../../components/layout";
import { AnimatedPressable, Button, Card, CardActionFooter, ChoiceRow, DisclosureCard, EmptyState, MetricCard, ScreenShell, SectionHeader, StatusBanner, SwitchRow, TextField, WeekdayPicker } from "../../components/ui";
import { formatDays, matchesDay } from "../../constants/schedule";
import { useAnthraTheme } from "../../design-system";
import type {
  DashboardStats,
  UserSettings,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput
} from "../../types";
import { getDayPartsInTimeZone, getDeviceTimeZone } from "../../utils/timezone";
import { getPlansForWeekday, getScheduledWorkoutDays } from "../../utils/workoutSchedule";
import {
  digitsOnly,
  formatDuration,
  formatHistoryDate,
  formatTimeLabel,
  normalizeReminderLeadMinutes,
  parsePositiveNumber,
  parseStrictWholeNumber,
  withAlpha
} from "./workoutHelpers";
import { BodyProfileView, WorkoutHistoryView, WorkoutOverview, WorkoutPlansView, WorkoutSettingsView } from "./WorkoutViews";

export type WorkoutBuddyScreenProps = {
  onBack: () => void;
  section?: "workout" | "profile" | "settings";
  activeTab: WorkoutTab;
  onTabChange: (tab: WorkoutTab) => void;
  planListMode: "all" | "today";
  onPlanListModeChange: (mode: "all" | "today") => void;

  plans: WorkoutPlan[];
  stats: DashboardStats;
  history: WorkoutHistoryEntry[];
  settings: UserSettings;

  profileHeightCm: string;
  profileWeightKg: string;
  profileGoal: string;
  onProfileHeightChange: (v: string) => void;
  onProfileWeightChange: (v: string) => void;
  onProfileGoalChange: (v: string) => void;
  onSaveProfile: () => void;
  profileSaving: boolean;
  profileNotice: { type: "success" | "error"; message: string } | null;

  weeklyGoalText: string;
  reminderHourText: string;
  reminderMinuteText: string;
  reminderCount: number;
  reminderLeadTexts: string[];
  onWeeklyGoalTextChange: (v: string) => void;
  onReminderHourTextChange: (v: string) => void;
  onReminderMinuteTextChange: (v: string) => void;
  onReminderCountChange: (n: number) => void;
  onReminderLeadTextChange: (index: number, v: string) => void;
  onToggleGlobalWorkoutDay: (day: number) => void;
  onSettingsChange: (updater: (prev: UserSettings) => UserSettings) => void;
  onClearSettingsNotice: () => void;
  onSaveSettings: () => void;
  settingsSaving: boolean;
  settingsNotice: { type: "success" | "error"; message: string } | null;
  onExportBackup: () => void;
  onImportBackup: () => void;
  backupBusy: boolean;

  onStartPlan: (plan: WorkoutPlan) => void;
  onCreatePlan: () => void;
  onEditPlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (plan: WorkoutPlan) => void;
  onSharePlan: (plan: WorkoutPlan) => void;
  onImportPlan: () => void;
  editorOpen: boolean;
  editingPlan: WorkoutPlan | null;
  onCloseEditor: () => void;
  onSavePlan: (input: WorkoutPlanInput) => Promise<boolean>;

  onDeleteHistoryEntry: (entry: WorkoutHistoryEntry) => void;

  keyboardBottomPadding: number;
};

export function WorkoutBuddyScreen({
  onBack,
  section = "workout",
  activeTab,
  onTabChange,
  planListMode,
  onPlanListModeChange,
  plans,
  stats,
  history,
  settings,
  profileHeightCm,
  profileWeightKg,
  profileGoal,
  onProfileHeightChange,
  onProfileWeightChange,
  onProfileGoalChange,
  onSaveProfile,
  profileSaving,
  profileNotice,
  weeklyGoalText,
  reminderHourText,
  reminderMinuteText,
  reminderCount,
  reminderLeadTexts,
  onWeeklyGoalTextChange,
  onReminderHourTextChange,
  onReminderMinuteTextChange,
  onReminderCountChange,
  onReminderLeadTextChange,
  onToggleGlobalWorkoutDay,
  onSettingsChange,
  onClearSettingsNotice,
  onSaveSettings,
  settingsSaving,
  settingsNotice,
  onExportBackup,
  onImportBackup,
  backupBusy,
  onStartPlan,
  onCreatePlan,
  onEditPlan,
  onDeletePlan,
  onSharePlan,
  onImportPlan,
  editorOpen,
  editingPlan,
  onCloseEditor,
  onSavePlan,
  onDeleteHistoryEntry,
  keyboardBottomPadding
}: WorkoutBuddyScreenProps) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const shareCardRef = useRef<View>(null);
  const profileWeightInputRef = useRef<TextInput>(null);
  const profileGoalInputRef = useRef<TextInput>(null);

  const textPrimary = theme.colors.textPrimary;
  const textMuted = theme.colors.textSecondary;
  const inputBackground = theme.colors.surfaceSubtle;
  const shouldStackWorkoutActions = windowWidth < 360 || fontScale >= 1.35;
  const shouldStackWorkoutHeaders = windowWidth < 390 || fontScale >= 1.25;
  const shouldStackWorkoutStats = windowWidth < 340 || fontScale >= 1.5;

  const workoutTheme = useMemo(
    () => ({
      accent: theme.colors.brand,
      accentSoft: theme.colors.brandSoft,
      accentBorder: theme.colors.brandBorder
    }),
    [theme.colors.brand, theme.colors.brandBorder, theme.colors.brandSoft]
  );
  const workoutTimeZoneOptions = useMemo(
    () => Array.from(new Set([deviceTimeZone, "Asia/Kolkata"])),
    [deviceTimeZone]
  );

  const activeSection = section === "workout" ? activeTab : section;
  const tabTitle =
    activeSection === "home"
      ? "Overview"
      : activeSection === "plans"
        ? "Workout Plans"
        : activeSection === "history"
          ? "History"
          : activeSection === "profile"
            ? "Body"
            : "Settings";

  const currentWeekday = getDayPartsInTimeZone(
    Date.now(),
    0,
    settings.timezone || deviceTimeZone
  ).weekday;
  const scheduledWorkoutDays = useMemo(
    () => getScheduledWorkoutDays(plans, settings.workoutDays),
    [plans, settings.workoutDays]
  );
  const isWorkoutDayToday = matchesDay(scheduledWorkoutDays, currentWeekday);
  const workoutDaysLabel = useMemo(
    () => formatDays(scheduledWorkoutDays),
    [scheduledWorkoutDays]
  );
  const qualifyingSessionCount = useMemo(
    () => history.filter((entry) => entry.progressPercent >= 40).length,
    [history]
  );
  const todaysPlans = useMemo(
    () => getPlansForWeekday(plans, currentWeekday),
    [currentWeekday, plans]
  );
  const quickStartPlan = isWorkoutDayToday ? (todaysPlans[0] ?? null) : null;
  const displayedPlans = planListMode === "today" ? todaysPlans : plans;

  const heightCm = parsePositiveNumber(profileHeightCm);
  const weightKg = parsePositiveNumber(profileWeightKg);
  const bmi =
    heightCm != null && weightKg != null
      ? weightKg / Math.pow(Math.max(0.1, heightCm / 100), 2)
      : null;
  const roundedBmi = bmi != null ? Math.round(bmi * 10) / 10 : null;

  const bmiSummary = useMemo(() => {
    if (roundedBmi == null) {
      return {
        label: "Add your metrics",
        note: "Enter height and weight to calculate BMI.",
        textColor: theme.colors.textPrimary,
        badgeBackground: theme.colors.surfaceSubtle,
        badgeTextColor: theme.colors.textSecondary
      };
    }
    if (roundedBmi < 18.5) {
      return {
        label: "Underweight",
        note: "BMI below 18.5",
        textColor: theme.colors.warning,
        badgeBackground: theme.colors.warningSoft,
        badgeTextColor: theme.colors.warning
      };
    }
    if (roundedBmi < 25) {
      return {
        label: "Healthy Range",
        note: "BMI between 18.5 and 24.9",
        textColor: theme.colors.success,
        badgeBackground: theme.colors.successSoft,
        badgeTextColor: theme.colors.success
      };
    }
    if (roundedBmi < 30) {
      return {
        label: "Overweight",
        note: "BMI between 25 and 29.9",
        textColor: theme.colors.warning,
        badgeBackground: theme.colors.warningSoft,
        badgeTextColor: theme.colors.warning
      };
    }
    return {
      label: "Obesity",
      note: "BMI 30 and above",
      textColor: theme.colors.danger,
      badgeBackground: theme.colors.dangerSoft,
      badgeTextColor: theme.colors.danger
    };
  }, [roundedBmi, theme.colors]);

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
    return `${formatTimeLabel(hour, minute)} workout time in ${settings.timezone}, remind ${previewLeads.join(", ")} min before`;
  }, [
    reminderHourText,
    reminderMinuteText,
    reminderCount,
    reminderLeadTexts,
    settings.timezone
  ]);

  const handleShareStreak = async () => {
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

  return (
    <View style={{ flex: 1 }}>
      <ScreenShell
        header={{ eyebrow: section === "workout" ? "MOVE" : "ANTHRA", title: tabTitle, subtitle: activeSection === "home" ? `${workoutDaysLabel} schedule` : undefined, onBack, backLabel: "Back to Today", divider: true }}
        background={backgrounds.canvas}
        contentStyle={{ paddingBottom: keyboardBottomPadding }}
        bottomTab={section === "workout" ? <WorkoutTabBar activeTab={activeTab} onChange={(tab) => { if (tab === "plans") onPlanListModeChange("all"); onTabChange(tab); }} /> : undefined}
      >
            {activeSection === "home" && (
              <WorkoutOverview>
                <Card variant="brand">
                  <View
                    style={{
                      flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                      alignItems: shouldStackWorkoutHeaders ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: theme.spacing.sm
                    }}
                  >
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: withAlpha(workoutTheme.accent, 0.2) }}>
                      <Text style={[theme.typography.eyebrow, { color: workoutTheme.accent }]}>
                        {isWorkoutDayToday ? "Workout Day" : "Recovery Day"}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={shouldStackWorkoutHeaders ? 2 : 1}
                      style={[theme.typography.eyebrow, { color: textMuted, minWidth: 0, flexShrink: 1, textAlign: shouldStackWorkoutHeaders ? "left" : "right" }]}
                    >
                      {workoutDaysLabel}
                    </Text>
                  </View>

                  {quickStartPlan ? (
                    <View style={{ marginTop: theme.spacing.lg }}>
                      <Text style={[theme.typography.headline, { color: textPrimary }]}>Start workout</Text>
                      <Text
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        style={[theme.typography.titleMedium, { color: textPrimary, marginTop: theme.spacing.xs }]}
                      >
                        {quickStartPlan.name}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[theme.typography.headline, { color: textPrimary, marginTop: theme.spacing.lg }]}>
                      {isWorkoutDayToday ? "Pick a plan for today" : "Today is for recovery"}
                    </Text>
                  )}

                  <Text style={[theme.typography.bodyLarge, { color: textMuted, marginTop: theme.spacing.sm }]}>
                    {quickStartPlan
                      ? todaysPlans.length > 1
                        ? `${todaysPlans.length} plans match today. Anthra is ready to launch the first one.`
                        : "Your scheduled workout is ready to go."
                      : isWorkoutDayToday
                        ? "Your schedule says today is a workout day, but no plan is assigned yet."
                        : "No workout is scheduled today. You can review progress, adjust plans, or keep it as a rest day."}
                  </Text>

                  <View
                    className="mt-5"
                    style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: theme.spacing.md }}
                  >
                    <Button
                      label={quickStartPlan ? "Start workout" : isWorkoutDayToday ? "Choose plan" : "View history"}
                      onPress={() => {
                        if (quickStartPlan) {
                          onStartPlan(quickStartPlan);
                          return;
                        }
                        if (isWorkoutDayToday) onPlanListModeChange("all");
                        onTabChange(isWorkoutDayToday ? "plans" : "history");
                      }}
                      fullWidth
                      size="large"
                      style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                    />
                    <Button
                      label="Manage plans"
                      onPress={() => {
                        onPlanListModeChange("all");
                        onTabChange("plans");
                      }}
                      variant="outline"
                      fullWidth
                      size="large"
                      style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                    />
                  </View>
                </Card>

                <View
                  className="mt-5"
                  style={{ flexDirection: shouldStackWorkoutStats ? "column" : "row", gap: theme.spacing.md }}
                >
                  <MetricCard title="Streak" value={stats.currentStreak} unit="days" style={{ flex: shouldStackWorkoutStats ? undefined : 1 }} />
                  <MetricCard title="Sessions" value={qualifyingSessionCount} unit="logged" style={{ flex: shouldStackWorkoutStats ? undefined : 1 }} />
                </View>

                <Card style={{ marginTop: theme.spacing.xl }}>
                  <View
                    style={{
                      flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                      alignItems: shouldStackWorkoutHeaders ? "stretch" : "center",
                      justifyContent: "space-between",
                      gap: theme.spacing.md
                    }}
                  >
                    <View className="min-w-0 flex-1">
                      <Text style={[theme.typography.eyebrow, { color: textMuted }]}>
                        Weekly Progress
                      </Text>
                      <Text style={[theme.typography.titleMedium, { color: textPrimary, marginTop: theme.spacing.xs }]}>
                        {stats.weekCompleted >= stats.weekGoal ? "Goal on track" : "Keep the streak moving"}
                      </Text>
                    </View>
                    <Button
                      label="Share"
                      onPress={handleShareStreak}
                      size="small"
                      variant="secondary"
                      style={{ alignSelf: shouldStackWorkoutHeaders ? "stretch" : "flex-start" }}
                    />
                  </View>

                  <View className="mt-4">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm font-semibold" style={{ color: textMuted }}>Completed this week</Text>
                      <Text className="text-sm font-semibold" style={{ color: textPrimary }}>
                        {stats.weekCompleted}/{stats.weekGoal}
                      </Text>
                    </View>
                    <ProgressBar
                      value={stats.weekCompleted}
                      max={stats.weekGoal}
                      fillColor={workoutTheme.accent}
                      trackColor={theme.colors.progressTrack}
                    />
                  </View>

                  <Text style={[theme.typography.eyebrow, { color: textMuted, marginTop: theme.spacing.md }]}>
                    {stats.streakWeeks > 0
                      ? `Streak running for ${stats.streakWeeks} week${stats.streakWeeks === 1 ? "" : "s"}`
                      : "Finish this week strong to start your streak"}
                  </Text>
                </Card>

              </WorkoutOverview>
            )}

            {activeSection === "plans" && (
              <WorkoutPlansView>
                <View
                  style={{
                    flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                    alignItems: shouldStackWorkoutHeaders ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: theme.spacing.md
                  }}
                >
                  <View className="min-w-0 flex-1">
                    <Text style={[theme.typography.titleLarge, { color: textPrimary }]}>
                      {planListMode === "today" ? "Choose today’s workout" : "Your Plans"}
                    </Text>
                    {planListMode === "today" && (
                      <Text className="mt-1 text-sm" style={{ color: textMuted }}>
                        {displayedPlans.length === 1
                          ? "One plan matches today’s schedule."
                          : `${displayedPlans.length} plans match today’s schedule.`}
                      </Text>
                    )}
                  </View>
                  <View
                    style={{
                      alignSelf: shouldStackWorkoutHeaders ? "stretch" : "flex-start",
                      flexDirection: "row",
                      gap: theme.spacing.sm
                    }}
                  >
                    {planListMode === "all" && (
                      <Button
                        label="Import"
                        onPress={onImportPlan}
                        size="small"
                        variant="outline"
                        style={{ flex: shouldStackWorkoutHeaders ? 1 : undefined }}
                      />
                    )}
                    <Button
                      label={planListMode === "today" ? "View all" : "New plan"}
                      onPress={() => {
                        if (planListMode === "today") {
                          onPlanListModeChange("all");
                          return;
                        }
                        onCreatePlan();
                      }}
                      size="small"
                      variant={planListMode === "today" ? "outline" : "primary"}
                      style={{ flex: shouldStackWorkoutHeaders ? 1 : undefined }}
                    />
                  </View>
                </View>

                {displayedPlans.length === 0 && (
                  <EmptyState
                    icon={ClipboardList}
                    title={planListMode === "today" ? "No plan is assigned today" : "Build your first workout"}
                    description={
                      planListMode === "today"
                        ? "View all plans to start an unscheduled workout, or edit a plan’s training days."
                        : "Choose work, rest, rounds, and days. Anthra will guide the session from there."
                    }
                    action={{
                      label: planListMode === "today" ? "View all plans" : "Create a plan",
                      onPress: () => (planListMode === "today" ? onPlanListModeChange("all") : onCreatePlan())
                    }}
                    style={{ marginTop: theme.spacing.lg }}
                  />
                )}

                {displayedPlans.map((plan) => {
                  const setCount = plan.sections.length;
                  const exerciseCount = plan.sections.reduce(
                    (total, section) => total + section.exercises.length,
                    0
                  );

                  return (
                    <Swipeable
                      key={plan.id}
                      renderRightActions={() => (
                        <AnimatedPressable
                          onPress={() => onDeletePlan(plan)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${plan.name}`}
                          className="ml-3 mt-4 items-center justify-center rounded-2xl px-6"
                          style={{ backgroundColor: theme.colors.dangerSolid }}
                        >
                          <Text className="font-bold" style={{ color: theme.colors.textOnDangerSolid }}>Delete</Text>
                        </AnimatedPressable>
                      )}
                    >
                      <Card treatment="interactive" style={{ marginTop: theme.spacing.md }}>
                        <View style={{ minWidth: 0 }}>
                            <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleMedium, { color: textPrimary }]}>{plan.name}</Text>
                            <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs }]}>
                              {setCount} {setCount === 1 ? "set" : "sets"} · {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
                            </Text>
                            <Text numberOfLines={2} style={[theme.typography.eyebrow, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs }]}>
                              {formatDays(plan.workoutDays)}
                            </Text>
                        </View>
                        <View
                          className="mt-4"
                          style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: theme.spacing.sm }}
                        >
                          <Button
                            label="Share"
                            icon={Share2}
                            onPress={() => onSharePlan(plan)}
                            variant="secondary"
                            size="small"
                            style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                          />
                          <Button
                            label="Edit"
                            onPress={() => onEditPlan(plan)}
                            variant="outline"
                            size="small"
                            style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                          />
                        </View>
                        <Button
                          label="Start workout"
                          onPress={() => onStartPlan(plan)}
                          fullWidth
                          style={{ marginTop: 16 }}
                        />
                      </Card>
                    </Swipeable>
                  );
                })}
              </WorkoutPlansView>
            )}

            {activeSection === "history" && (
              <WorkoutHistoryView>
                <View
                  style={{
                    flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                    alignItems: shouldStackWorkoutHeaders ? "flex-start" : "center",
                    justifyContent: "space-between",
                    gap: theme.spacing.xs
                  }}
                >
                  <Text style={[theme.typography.titleLarge, { color: textPrimary }]}>Workout History</Text>
                  <Text style={[theme.typography.label, { color: textMuted }]}>{history.length} sessions</Text>
                </View>

                {history.length === 0 && (
                  <EmptyState
                    icon={History}
                    title="Your history starts here"
                    description="Completed and partial sessions will appear with progress, time, and your notes."
                    action={{
                      label: "Browse plans",
                      onPress: () => {
                        onPlanListModeChange("all");
                        onTabChange("plans");
                      }
                    }}
                    style={{ marginTop: theme.spacing.lg }}
                  />
                )}

                {history.map((entry) => (
                  <Card key={entry.id} style={{ marginTop: theme.spacing.md }}>
                    <View className="flex-row items-start justify-between">
                      <View className="min-w-0 flex-1 pr-4" style={{ minWidth: 0 }}>
                        <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleSmall, { color: textPrimary }]}>{entry.planName}</Text>
                        <Text numberOfLines={1} style={[theme.typography.eyebrow, { color: textMuted, marginTop: theme.spacing.xs }]}>
                          {formatHistoryDate(entry.startedAt)}
                        </Text>
                      </View>
                      <View className="items-end gap-2" style={{ flexShrink: 0 }}>
                        <AnimatedPressable
                          onPress={() => onDeleteHistoryEntry(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${entry.planName} workout from history`}
                          className="h-11 w-11 items-center justify-center rounded-full"
                          style={{ backgroundColor: theme.colors.dangerSoft }}
                        >
                          <Trash2 size={18} color={theme.colors.danger} />
                        </AnimatedPressable>
                        <View
                          className="rounded-lg px-2 py-1"
                          style={{ backgroundColor: entry.completed ? theme.colors.successSoft : theme.colors.warningSoft }}
                        >
                          <Text numberOfLines={1} style={[theme.typography.eyebrow, { color: entry.completed ? theme.colors.success : theme.colors.warning }]}>
                            {entry.completed ? "Completed" : "Partial"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="mt-3">
                      <View className="mb-1 flex-row items-center justify-between">
                        <Text className="text-sm font-semibold" style={{ color: textMuted }}>Progress</Text>
                        <Text className="text-sm font-semibold" style={{ color: textPrimary }}>
                          {Math.round(entry.progressPercent)}%
                        </Text>
                      </View>
                      <ProgressBar
                        value={entry.progressPercent}
                        max={100}
                        fillColor={workoutTheme.accent}
                        trackColor={theme.colors.progressTrack}
                      />
                    </View>

                    <Text className="mt-2 text-xs" style={{ color: theme.colors.textTertiary }}>
                      {entry.completedSegments}/{entry.totalSegments} segments • {formatDuration(entry.elapsedSeconds)}
                    </Text>

                    {entry.rating != null && (
                      <View className="mt-2 flex-row items-center" style={{ gap: theme.spacing.xs }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={`${entry.id}-rating-${star}`}
                            accessible={false}
                            size={14}
                            color={theme.colors.warning}
                            fill={star <= entry.rating! ? theme.colors.warning : "transparent"}
                          />
                        ))}
                        <Text className="ml-1 text-xs font-semibold" style={{ color: textMuted }}>
                          {entry.rating}/5
                        </Text>
                      </View>
                    )}

                    {entry.comment.trim().length > 0 && (
                      <DisclosureCard
                        title="Session notes"
                        summary="Tap to review"
                        style={{ marginTop: theme.spacing.sm }}
                      >
                        <Text style={[theme.typography.body, { color: textMuted }]}>{entry.comment}</Text>
                      </DisclosureCard>
                    )}
                  </Card>
                ))}
              </WorkoutHistoryView>
            )}

            {activeSection === "profile" && (
              <BodyProfileView>
                <Card>
                  <SectionHeader title="Body metrics" />
                  <View
                    className="mt-4"
                    style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: theme.spacing.md }}
                  >
                    <View style={{ flex: shouldStackWorkoutActions ? undefined : 1 }}>
                      <TextField
                        label="Height (cm)"
                        value={profileHeightCm}
                        onChangeText={onProfileHeightChange}
                        keyboardType="decimal-pad"
                        placeholder="170"
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={() => profileWeightInputRef.current?.focus()}
                        accessibilityHint="Enter your height in centimetres"
                      />
                    </View>
                    <View style={{ flex: shouldStackWorkoutActions ? undefined : 1 }}>
                      <TextField
                        ref={profileWeightInputRef}
                        label="Weight (kg)"
                        value={profileWeightKg}
                        onChangeText={onProfileWeightChange}
                        keyboardType="decimal-pad"
                        placeholder="70"
                        returnKeyType="next"
                        submitBehavior="submit"
                        onSubmitEditing={() => profileGoalInputRef.current?.focus()}
                        accessibilityHint="Enter your weight in kilograms"
                      />
                    </View>
                  </View>
                </Card>

                <Card style={{ marginTop: theme.spacing.md }}>
                  <View
                    style={{
                      flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                      alignItems: shouldStackWorkoutHeaders ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: theme.spacing.sm
                    }}
                  >
                    <Text style={[theme.typography.eyebrow, { color: textMuted }]}>BMI</Text>
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: bmiSummary.badgeBackground }}>
                      <Text style={[theme.typography.eyebrow, { color: bmiSummary.badgeTextColor }]}>
                        {bmiSummary.label}
                      </Text>
                    </View>
                  </View>
                  <Text style={[theme.typography.metric, { color: bmiSummary.textColor, marginTop: theme.spacing.md }]}>
                    {roundedBmi != null ? roundedBmi : "--"}
                  </Text>
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>{bmiSummary.note}</Text>
                </Card>

                <Card style={{ marginTop: theme.spacing.md }}>
                  <TextField
                    ref={profileGoalInputRef}
                    label="Goals"
                    value={profileGoal}
                    onChangeText={onProfileGoalChange}
                    multiline
                    textAlignVertical="top"
                    placeholder="Example: Reach 68kg and train 4 days/week."
                    helperText="Keep this specific and achievable; it stays on this device."
                  />
                </Card>

                <CardActionFooter
                  action={{
                    label: "Save body details",
                    onPress: onSaveProfile,
                    loading: profileSaving
                  }}
                />

                {profileNotice && (
                  <StatusBanner
                    className="mt-3"
                    title={profileNotice.type === "success" ? "Body details saved" : "Body details not saved"}
                    message={profileNotice.message}
                    variant={profileNotice.type === "success" ? "success" : "danger"}
                  />
                )}
              </BodyProfileView>
            )}

            {activeSection === "settings" && (
              <WorkoutSettingsView>
                <Card>
                  <SectionHeader title="Workout plan defaults" />
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                    New plans start with {formatDays(settings.workoutDays)}. Existing plan days control Today and workout reminders.
                  </Text>

                  <WeekdayPicker
                    label="Default training days"
                    value={settings.workoutDays}
                    onChange={(days) => {
                      const changedDay = [...settings.workoutDays, ...days].find(
                        (day) => settings.workoutDays.includes(day) !== days.includes(day)
                      );
                      if (changedDay != null) onToggleGlobalWorkoutDay(changedDay);
                    }}
                    style={{ marginTop: theme.spacing.lg }}
                  />

                  <View className="mt-5">
                    <TextField
                      label="Workout weekly streak goal"
                      value={weeklyGoalText}
                      onChangeText={(value) => {
                        if (settingsNotice) onClearSettingsNotice();
                        onWeeklyGoalTextChange(digitsOnly(value));
                      }}
                      keyboardType="number-pad"
                      placeholder="4"
                      maxLength={1}
                      helperText="Choose 1–7 completed workout days per week."
                    />
                  </View>
                </Card>

                <Card style={{ marginTop: theme.spacing.md }}>
                  <SectionHeader title="Workout reminders" />
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                    Choose workout time and set up to 3 reminder intervals.
                  </Text>
                  <Text style={[theme.typography.eyebrow, { color: textMuted, marginTop: theme.spacing.xs }]}>
                    Scheduled in {settings.timezone}
                  </Text>

                  <ChoiceRow
                    value={settings.timezone}
                    options={workoutTimeZoneOptions.map((timezone) => ({
                      value: timezone,
                      label: timezone === deviceTimeZone ? `Device · ${timezone}` : timezone
                    }))}
                    onChange={(timezone) => {
                      if (settingsNotice) onClearSettingsNotice();
                      onSettingsChange((current) => ({ ...current, timezone }));
                    }}
                    style={{ marginTop: theme.spacing.md }}
                  />

                  <SwitchRow
                    label="Workout reminders"
                    description={settings.notificationsEnabled
                      ? "Anthra will use the delivery method, workout time, and lead times below."
                      : "Turn this on to schedule workout notifications or alarms."}
                    value={settings.notificationsEnabled}
                    onValueChange={(enabled) => {
                      if (settingsNotice) onClearSettingsNotice();
                      onSettingsChange((prev) => ({ ...prev, notificationsEnabled: enabled }));
                    }}
                    style={{ marginTop: theme.spacing.lg }}
                  />

                  <View className="mt-4">
                    <ChoiceRow
                      label="How should Anthra remind you?"
                      value={settings.reminderDelivery}
                      layout="equal"
                      disabled={!settings.notificationsEnabled}
                      options={[
                        { value: "notification", label: "Notification" },
                        { value: "alarm", label: "Alarm", disabled: Platform.OS !== "android" },
                        { value: "both", label: "Both", disabled: Platform.OS !== "android" }
                      ]}
                      onChange={(reminderDelivery) => {
                        if (settingsNotice) onClearSettingsNotice();
                        onSettingsChange((current) => ({ ...current, reminderDelivery }));
                      }}
                    />
                    <Text className="mt-2 text-xs" style={{ color: textMuted }}>
                      Workout alarms ring full-screen on Android and use a regular Dismiss button. Push-up verification is only used by Alarm Buddy.
                    </Text>
                  </View>

                  <View className="mt-4">
                    <TimePickerField
                      label="Workout time"
                      hour={parseStrictWholeNumber(reminderHourText) ?? 18}
                      minute={parseStrictWholeNumber(reminderMinuteText) ?? 0}
                      onChange={(hour, minute) => {
                        if (settingsNotice) onClearSettingsNotice();
                        onReminderHourTextChange(String(hour));
                        onReminderMinuteTextChange(String(minute));
                      }}
                      accentColor={workoutTheme.accent}
                      borderColor={workoutTheme.accentBorder}
                      backgroundColor={inputBackground}
                      textColor={textPrimary}
                      mutedColor={textMuted}
                      presets={[
                        { label: "Morning · 7 AM", hour: 7, minute: 0 },
                        { label: "Evening · 6 PM", hour: 18, minute: 0 },
                        { label: "Night · 8 PM", hour: 20, minute: 0 }
                      ]}
                    />
                  </View>

                  <View className="mt-4">
                    <ChoiceRow
                      label="How many reminders?"
                      value={String(reminderCount)}
                      layout="equal"
                      options={[1, 2, 3].map((count) => ({
                        value: String(count),
                        label: `${count}`
                      }))}
                      onChange={(value) => {
                        if (settingsNotice) onClearSettingsNotice();
                        onReminderCountChange(Number(value));
                      }}
                    />
                  </View>

                  <View className="mt-4 gap-2">
                    {Array.from({ length: reminderCount }).map((_, index) => (
                      <TextField
                        key={`lead-${index}`}
                        label={`Reminder ${index + 1} lead time`}
                          value={reminderLeadTexts[index] ?? ""}
                          onChangeText={(value) => onReminderLeadTextChange(index, value)}
                          keyboardType="number-pad"
                          placeholder={index === 0 ? "30" : index === 1 ? "15" : "5"}
                          maxLength={3}
                          helperText="Minutes before the workout (0–720)."
                      />
                    ))}
                  </View>

                  <Text style={[theme.typography.eyebrow, { color: textMuted, marginTop: theme.spacing.md }]}>
                    {reminderPreview}
                  </Text>
                </Card>

                <CardActionFooter
                  action={{
                    label: "Save workout settings",
                    onPress: onSaveSettings,
                    loading: settingsSaving
                  }}
                />

                {settingsNotice && (
                  <StatusBanner
                    className="mt-3"
                    title={settingsNotice.type === "success" ? "Workout settings saved" : "Workout settings not saved"}
                    message={settingsNotice.message}
                    variant={settingsNotice.type === "success" ? "success" : "danger"}
                  />
                )}

                <Card style={{ marginTop: theme.spacing.xl }}>
                  <SectionHeader title="Anthra backup & restore" />
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                    Save workouts, history, alarms, reminders, lists, tracker, activity, nutrition, body details, and settings as a JSON file. Password Buddy credentials stay in secure device storage and are never exported.
                  </Text>
                  <View
                    className="mt-4"
                    style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: theme.spacing.md }}
                  >
                    <Button
                      label={backupBusy ? "Working…" : "Export"}
                      onPress={() => onExportBackup()}
                      disabled={backupBusy}
                      accessibilityLabel="Export Anthra backup"
                      style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                    />
                    <Button
                      label="Restore"
                      onPress={() => onImportBackup()}
                      disabled={backupBusy}
                      accessibilityLabel="Restore Anthra backup"
                      variant="outline"
                      style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                    />
                  </View>
                </Card>

                <Card style={{ marginTop: theme.spacing.md }}>
                  <AppearanceControl />
                </Card>
              </WorkoutSettingsView>
            )}
      </ScreenShell>

        <View
          className="absolute -left-[2000px] -top-[2000px]"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View ref={shareCardRef} collapsable={false}>
            <StreakCard
              streakDays={stats.currentStreak}
              bestStreak={stats.bestStreak}
              totalWorkouts={stats.totalWorkouts}
              averageWorkoutSeconds={stats.averageWorkoutSeconds}
              weekCompleted={stats.weekCompleted}
              weekGoal={stats.weekGoal}
              accentColor={workoutTheme.accent}
            />
          </View>
        </View>

        <PlanEditorModal
          visible={editorOpen}
          initialPlan={editingPlan}
          defaultWorkoutDays={settings.workoutDays}
          onClose={onCloseEditor}
          onSave={onSavePlan}
        />
    </View>
  );
}
