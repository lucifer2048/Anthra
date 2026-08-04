import { useMemo, useRef } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  type TextInput,
  useWindowDimensions,
  View
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { Share2, Star, Trash2 } from "lucide-react-native";

import { PlanEditorModal } from "../../components/PlanEditorModal";
import { ProgressBar } from "../../components/ProgressBar";
import { STREAK_CARD_HEIGHT, STREAK_CARD_WIDTH, StreakCard } from "../../components/StreakCard";
import { TimePickerField } from "../../components/TimePickerField";
import { AppearanceControl } from "../../components/AppearanceControl";
import { WorkoutTabBar, type WorkoutTab } from "../../components/WorkoutTabBar";
import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import { Button, ScreenHeader, StatusBanner, SwitchRow, TextField } from "../../components/ui";
import { WEEKDAY_OPTIONS, formatDays, matchesDay } from "../../constants/schedule";
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

export type WorkoutBuddyScreenProps = {
  onBack: () => void;
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

  const borderColor = theme.colors.border;
  const textPrimary = theme.colors.textPrimary;
  const textMuted = theme.colors.textSecondary;
  const cardBackground = theme.colors.surfaceElevated;
  const inputBackground = theme.colors.surfaceSubtle;
  const shouldStackWorkoutActions = windowWidth < 420 || fontScale >= 1.2;
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
  const workoutCardStyle = { borderColor, backgroundColor: cardBackground };
  const workoutInputSurfaceStyle = {
    borderColor: theme.colors.borderStrong,
    backgroundColor: inputBackground
  };

  const workoutTimeZoneOptions = useMemo(
    () => Array.from(new Set([deviceTimeZone, "Asia/Kolkata"])),
    [deviceTimeZone]
  );

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
      <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
          <View className="border-b px-5" style={{ borderColor }}>
            <ScreenHeader
              eyebrow="MOVE"
              title={tabTitle}
              subtitle={activeTab === "home" ? `${workoutDaysLabel} schedule` : undefined}
              onBack={onBack}
              backLabel="Back to Today"
              style={{ width: "100%", maxWidth: theme.layout.contentMaxWidth, alignSelf: "center" }}
            />
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              width: "100%",
              maxWidth: theme.layout.contentMaxWidth,
              alignSelf: "center",
              padding: 20,
              paddingTop: 24,
              paddingBottom: keyboardBottomPadding
            }}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === "home" && (
              <>
                <View className="rounded-3xl border p-5" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: workoutTheme.accentSoft }}>
                  <View
                    style={{
                      flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                      alignItems: shouldStackWorkoutHeaders ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: theme.spacing.sm
                    }}
                  >
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: withAlpha(workoutTheme.accent, 0.2) }}>
                      <Text className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: workoutTheme.accent }}>
                        {isWorkoutDayToday ? "Workout Day" : "Recovery Day"}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={shouldStackWorkoutHeaders ? undefined : 1}
                      className="text-xs font-semibold uppercase tracking-[1.5px]"
                      style={{ color: textMuted, flexShrink: 1, textAlign: shouldStackWorkoutHeaders ? "left" : "right" }}
                    >
                      {workoutDaysLabel}
                    </Text>
                  </View>

                  <Text className="mt-4 text-3xl font-black" style={{ color: textPrimary }}>
                    {quickStartPlan
                      ? `Start ${quickStartPlan.name}`
                      : isWorkoutDayToday
                        ? "Pick a plan for today"
                        : "Today is for recovery"}
                  </Text>

                  <Text className="mt-2 text-sm leading-6" style={{ color: textMuted }}>
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
                </View>

                <View
                  className="mt-5"
                  style={{ flexDirection: shouldStackWorkoutStats ? "column" : "row", gap: theme.spacing.md }}
                >
                  <View
                    className="rounded-2xl border p-4"
                    style={[workoutCardStyle, { flex: shouldStackWorkoutStats ? undefined : 1 }]}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-[1.7px]" style={{ color: textMuted }}>Streak</Text>
                    <Text className="mt-2 text-4xl font-black" style={{ color: workoutTheme.accent }}>{stats.currentStreak}</Text>
                    <Text className="text-sm font-semibold" style={{ color: textMuted }}>days</Text>
                  </View>
                  <View
                    className="rounded-2xl border p-4"
                    style={[workoutCardStyle, { flex: shouldStackWorkoutStats ? undefined : 1 }]}
                  >
                    <Text className="text-xs font-semibold uppercase tracking-[1.7px]" style={{ color: textMuted }}>Sessions</Text>
                    <Text className="mt-2 text-4xl font-black" style={{ color: textPrimary }}>{qualifyingSessionCount}</Text>
                    <Text className="text-sm font-semibold" style={{ color: textMuted }}>logged</Text>
                  </View>
                </View>

                <View className="mt-5 rounded-3xl border p-5" style={workoutCardStyle}>
                  <View
                    style={{
                      flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                      alignItems: shouldStackWorkoutHeaders ? "stretch" : "center",
                      justifyContent: "space-between",
                      gap: theme.spacing.md
                    }}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm font-semibold uppercase tracking-[2px]" style={{ color: textMuted }}>
                        Weekly Progress
                      </Text>
                      <Text className="mt-1 text-xl font-black" style={{ color: textPrimary }}>
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

                  <Text className="mt-3 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: textMuted }}>
                    {stats.streakWeeks > 0
                      ? `Streak running for ${stats.streakWeeks} week${stats.streakWeeks === 1 ? "" : "s"}`
                      : "Finish this week strong to start your streak"}
                  </Text>
                </View>

              </>
            )}

            {activeTab === "plans" && (
              <>
                <View
                  style={{
                    flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                    alignItems: shouldStackWorkoutHeaders ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: theme.spacing.md
                  }}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-2xl font-black" style={{ color: textPrimary }}>
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
                  <View className="mt-4 rounded-2xl border border-dashed p-5" style={workoutCardStyle}>
                    <Text className="text-lg font-bold" style={{ color: textPrimary }}>
                      {planListMode === "today" ? "No plan is assigned today" : "Build your first workout"}
                    </Text>
                    <Text className="mt-1 text-sm" style={{ color: textMuted }}>
                      {planListMode === "today"
                        ? "View all plans to start an unscheduled workout, or edit a plan’s training days."
                        : "Choose work, rest, rounds, and days. Anthra will guide the session from there."}
                    </Text>
                    <Button
                      label={planListMode === "today" ? "View all plans" : "Create a plan"}
                      onPress={() => planListMode === "today" ? onPlanListModeChange("all") : onCreatePlan()}
                      variant={planListMode === "today" ? "outline" : "primary"}
                      style={{ marginTop: 16 }}
                    />
                  </View>
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
                        <Pressable
                          onPress={() => onDeletePlan(plan)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${plan.name}`}
                          className="ml-3 mt-4 items-center justify-center rounded-2xl px-6"
                          style={{ backgroundColor: theme.colors.dangerSolid }}
                        >
                          <Text className="font-bold" style={{ color: theme.colors.textOnDangerSolid }}>Delete</Text>
                        </Pressable>
                      )}
                    >
                      <View className="mt-4 rounded-2xl border p-4" style={workoutCardStyle}>
                        <View className="min-w-0">
                            <Text className="text-lg font-bold" style={{ color: textPrimary }}>{plan.name}</Text>
                            <Text className="mt-1 text-sm" style={{ color: theme.colors.textTertiary }}>
                              {setCount} {setCount === 1 ? "set" : "sets"} · {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
                            </Text>
                            <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: theme.colors.textTertiary }}>
                              {formatDays(plan.workoutDays)}
                            </Text>
                        </View>
                        <View className="mt-4 flex-row" style={{ gap: theme.spacing.sm }}>
                          <Button
                            label="Share"
                            icon={Share2}
                            onPress={() => onSharePlan(plan)}
                            variant="secondary"
                            size="small"
                            style={{ flex: 1, alignSelf: "stretch" }}
                          />
                          <Button
                            label="Edit"
                            onPress={() => onEditPlan(plan)}
                            variant="outline"
                            size="small"
                            style={{ flex: 1, alignSelf: "stretch" }}
                          />
                        </View>
                        <Button
                          label="Start workout"
                          onPress={() => onStartPlan(plan)}
                          fullWidth
                          style={{ marginTop: 16 }}
                        />
                      </View>
                    </Swipeable>
                  );
                })}
              </>
            )}

            {activeTab === "history" && (
              <>
                <View
                  style={{
                    flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                    alignItems: shouldStackWorkoutHeaders ? "flex-start" : "center",
                    justifyContent: "space-between",
                    gap: theme.spacing.xs
                  }}
                >
                  <Text className="text-2xl font-black" style={{ color: textPrimary }}>Workout History</Text>
                  <Text className="text-sm font-semibold" style={{ color: textMuted }}>{history.length} sessions</Text>
                </View>

                {history.length === 0 && (
                  <View className="mt-4 rounded-2xl border border-dashed p-5" style={workoutCardStyle}>
                    <Text className="text-lg font-bold" style={{ color: textPrimary }}>Your history starts here</Text>
                    <Text className="mt-1 text-sm" style={{ color: textMuted }}>Completed and partial sessions will appear with progress, time, and your notes.</Text>
                    <Button
                      label="Browse plans"
                      onPress={() => {
                        onPlanListModeChange("all");
                        onTabChange("plans");
                      }}
                      variant="outline"
                      style={{ marginTop: 16 }}
                    />
                  </View>
                )}

                {history.map((entry) => (
                  <View key={entry.id} className="mt-4 rounded-2xl border p-4" style={workoutCardStyle}>
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-base font-bold" style={{ color: textPrimary }}>{entry.planName}</Text>
                        <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: textMuted }}>
                          {formatHistoryDate(entry.startedAt)}
                        </Text>
                      </View>
                      <View className="items-end gap-2">
                        <Pressable
                          onPress={() => onDeleteHistoryEntry(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${entry.planName} workout from history`}
                          className="h-11 w-11 items-center justify-center rounded-full"
                          style={{ backgroundColor: theme.colors.dangerSoft }}
                        >
                          <Trash2 size={18} color={theme.colors.danger} />
                        </Pressable>
                        <View
                          className="rounded-lg px-2 py-1"
                          style={{ backgroundColor: entry.completed ? theme.colors.successSoft : theme.colors.warningSoft }}
                        >
                          <Text
                            className="text-xs font-black uppercase"
                            style={{ color: entry.completed ? theme.colors.success : theme.colors.warning }}
                          >
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
                      <View className="mt-2 rounded-xl border px-3 py-2" style={workoutInputSurfaceStyle}>
                        <Text className="text-xs" style={{ color: textMuted }}>{entry.comment}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {activeTab === "profile" && (
              <>
                <View className="rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px]" style={{ color: textMuted }}>Body Metrics</Text>
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
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
                  <View
                    style={{
                      flexDirection: shouldStackWorkoutHeaders ? "column" : "row",
                      alignItems: shouldStackWorkoutHeaders ? "flex-start" : "center",
                      justifyContent: "space-between",
                      gap: theme.spacing.sm
                    }}
                  >
                    <Text className="text-sm font-semibold uppercase tracking-[2px]" style={{ color: textMuted }}>BMI</Text>
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: bmiSummary.badgeBackground }}>
                      <Text className="text-xs font-black uppercase" style={{ color: bmiSummary.badgeTextColor }}>
                        {bmiSummary.label}
                      </Text>
                    </View>
                  </View>
                  <Text className="mt-3 text-6xl font-black" style={{ color: bmiSummary.textColor }}>
                    {roundedBmi != null ? roundedBmi : "--"}
                  </Text>
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>{bmiSummary.note}</Text>
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
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
                </View>

                <Button
                  label="Save profile"
                  onPress={onSaveProfile}
                  loading={profileSaving}
                  fullWidth
                  size="large"
                  style={{ marginTop: 20 }}
                />

                {profileNotice && (
                  <StatusBanner
                    className="mt-3"
                    title={profileNotice.type === "success" ? "Profile saved" : "Profile not saved"}
                    message={profileNotice.message}
                    variant={profileNotice.type === "success" ? "success" : "danger"}
                  />
                )}
              </>
            )}

            {activeTab === "settings" && (
              <>
                <View className="rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px]" style={{ color: textMuted }}>
                    Default Plan Schedule
                  </Text>
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                    New plans start with {formatDays(settings.workoutDays)}. Existing plan days control Today and workout reminders.
                  </Text>

                  <View className="mt-4 flex-row flex-wrap" style={{ gap: theme.spacing.sm }}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const isActive = settings.workoutDays.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          onPress={() => onToggleGlobalWorkoutDay(day.value)}
                          accessibilityRole="checkbox"
                          accessibilityLabel={day.label}
                          accessibilityState={{ checked: isActive }}
                          className="min-h-[48px] items-center justify-center rounded-xl border px-2 py-2"
                          style={{
                            width: windowWidth < 520 || fontScale >= 1.2 ? "22%" : "12%",
                            borderColor: isActive ? workoutTheme.accent : workoutTheme.accentBorder,
                            backgroundColor: isActive ? withAlpha(workoutTheme.accent, 0.22) : inputBackground
                          }}
                        >
                          <Text className="text-xs font-bold uppercase" style={{ color: isActive ? workoutTheme.accent : textMuted }}>
                            {day.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View className="mt-5">
                    <TextField
                      label="Weekly streak goal"
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
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px]" style={{ color: textMuted }}>
                    Reminder Settings
                  </Text>
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                    Choose workout time and set up to 3 reminder intervals.
                  </Text>
                  <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.2px]" style={{ color: textMuted }}>
                    Scheduled in {settings.timezone}
                  </Text>

                  <View className="mt-3 flex-row flex-wrap gap-2">
                    {workoutTimeZoneOptions.map((timezone) => {
                      const active = settings.timezone === timezone;
                      return (
                        <Pressable
                          key={timezone}
                          onPress={() => {
                            if (settingsNotice) onClearSettingsNotice();
                            onSettingsChange((current) => ({ ...current, timezone }));
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          className="min-h-[44px] justify-center rounded-xl border px-3 py-2"
                          style={{
                            borderColor: active ? workoutTheme.accent : workoutTheme.accentBorder,
                            backgroundColor: active ? withAlpha(workoutTheme.accent, 0.2) : inputBackground
                          }}
                        >
                          <Text className="text-xs font-black" style={{ color: active ? workoutTheme.accent : textMuted }}>
                            {timezone === deviceTimeZone ? `Device · ${timezone}` : timezone}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

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
                    <Text className="mb-2 text-xs font-semibold" style={{ color: theme.colors.textTertiary }}>
                      How should Anthra remind you?
                    </Text>
                    <View className="flex-row gap-2">
                      {([
                        { value: "notification", label: "Notification" },
                        { value: "alarm", label: "Alarm" },
                        { value: "both", label: "Both" }
                      ] as const).map((option) => {
                        const active = settings.reminderDelivery === option.value;
                        const platformUnsupported =
                          Platform.OS !== "android" && option.value !== "notification";
                        return (
                          <Pressable
                            key={option.value}
                            disabled={platformUnsupported}
                            onPress={() => {
                              if (settingsNotice) onClearSettingsNotice();
                              onSettingsChange((current) => ({ ...current, reminderDelivery: option.value }));
                            }}
                            accessibilityRole="radio"
                            accessibilityLabel={`${option.label} workout reminders`}
                            accessibilityState={{ checked: active, selected: active }}
                            className="min-h-[48px] flex-1 items-center justify-center rounded-xl border px-2 py-2"
                            style={{
                              borderColor: active ? workoutTheme.accent : workoutTheme.accentBorder,
                              backgroundColor: active ? withAlpha(workoutTheme.accent, 0.2) : inputBackground,
                              opacity: platformUnsupported ? 0.35 : settings.notificationsEnabled ? 1 : 0.55
                            }}
                          >
                            <Text className="text-center text-xs font-black" style={{ color: active ? workoutTheme.accent : textMuted }}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
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
                    <Text className="mb-2 text-xs font-semibold" style={{ color: theme.colors.textTertiary }}>How many reminders?</Text>
                    <View className="flex-row gap-2">
                      {[1, 2, 3].map((count) => {
                        const active = reminderCount === count;
                        return (
                          <Pressable
                            key={count}
                            onPress={() => {
                              if (settingsNotice) onClearSettingsNotice();
                              onReminderCountChange(count);
                            }}
                            accessibilityRole="radio"
                            accessibilityLabel={`${count} workout reminder${count === 1 ? "" : "s"}`}
                            accessibilityState={{ checked: active, selected: active }}
                            className="min-h-[44px] flex-1 items-center justify-center rounded-xl border py-2"
                            style={{
                              borderColor: active ? workoutTheme.accent : workoutTheme.accentBorder,
                              backgroundColor: active ? withAlpha(workoutTheme.accent, 0.2) : inputBackground
                            }}
                          >
                            <Text className="text-sm font-black" style={{ color: active ? workoutTheme.accent : textMuted }}>
                              {count}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
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

                  <Text className="mt-3 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: textMuted }}>
                    {reminderPreview}
                  </Text>
                </View>

                <Button
                  label="Save settings"
                  onPress={onSaveSettings}
                  loading={settingsSaving}
                  fullWidth
                  size="large"
                  style={{ marginTop: 20 }}
                />

                {settingsNotice && (
                  <StatusBanner
                    className="mt-3"
                    title={settingsNotice.type === "success" ? "Settings saved" : "Settings not saved"}
                    message={settingsNotice.message}
                    variant={settingsNotice.type === "success" ? "success" : "danger"}
                  />
                )}

                <View className="mt-5 rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px]" style={{ color: textMuted }}>Backup & Restore</Text>
                  <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                    Save workouts, history, alarms, reminders, lists, profile, and settings as a JSON file. Password Buddy stays in secure device storage and is never exported.
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
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
                  <AppearanceControl />
                </View>
              </>
            )}
          </ScrollView>

          <WorkoutTabBar
            activeTab={activeTab}
            onChange={(tab) => {
              if (tab === "plans") onPlanListModeChange("all");
              onTabChange(tab);
            }}
          />
        </ScreenLayout>

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
