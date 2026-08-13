import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import {
  CircleCheck,
  Clock3,
  Footprints,
  HeartPulse,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  Share2,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon
} from "lucide-react-native";

import { ProgressBar } from "../../components/ProgressBar";
import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import {
  AnimatedPressable,
  Button,
  Card,
  ChoiceRow,
  EmptyState,
  IconButton,
  ScreenHeader,
  SectionHeader,
  SheetDialog,
  SkeletonCard,
  StatusBanner
} from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { getDayPartsInTimeZone, zonedDateTimeToTimestamp } from "../../utils/timezone";
import {
  acknowledgePendingPhoneStepDays,
  cancelCurrentPhoneStepReading,
  disablePhoneStepTracking,
  enablePhoneStepTracking,
  getActivityCapabilities,
  getCurrentPhoneStepReading,
  getHealthConnectStatus,
  getPendingPhoneStepDays,
  getPhoneStepStatus,
  openHealthConnectSettings,
  readHealthConnectDailyTotals,
  readHealthConnectWorkouts,
  requestHealthConnectPermissions
} from "./activityNative";
import {
  currentActivityTimezone,
  clearHealthConnectDailyTotals,
  getActivityDailySummary,
  getActivityDailySummaries,
  getActivitySettings,
  getActivitySyncState,
  getAnthraWorkoutDateKeys,
  getStoredActivityWorkouts,
  initActivityDatabase,
  recordActivitySyncAttempt,
  recordActivitySyncFailure,
  recordActivitySyncSuccess,
  replaceHealthWorkoutsInRange,
  saveActivitySettings,
  saveHealthDailyTotals,
  savePhoneStepDaySnapshots,
  savePhoneStepReading
} from "./activityRepository";
import {
  activeDaysThisWeek,
  calculateActivityStreak,
  dateKeyInTimeZone,
  qualifyingActivityDateKeys,
  recentDateKeys,
  unionActivityDateKeys
} from "./activityStats";
import type {
  ActivityCapabilities,
  ActivityDailySummary,
  ActivitySettings,
  ActivityShareScope,
  ActivitySyncState,
  HealthConnectStatus,
  PhoneStepStatus,
  StoredActivityWorkout
} from "./activityTypes";
import {
  ACTIVITY_STREAK_CARD_HEIGHT,
  ACTIVITY_STREAK_CARD_WIDTH,
  ActivityStreakCard
} from "./ActivityStreakCard";
import { ActivityHistoryChart } from "./components/ActivityHistoryChart";
import { supabase } from "../../services/supabaseClient";
import { publishTodaySocialStats } from "../social/socialService";

type ActivityBuddyScreenProps = {
  onBack: () => void;
};

type SourceTone = "success" | "warning" | "neutral";

type SourceCardProps = {
  icon: LucideIcon;
  title: string;
  status: string;
  statusTone: SourceTone;
  description: string;
  detail?: string;
  actionLabel: string;
  actionHint: string;
  actionVariant?: "primary" | "secondary" | "outline";
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onAction: () => void;
};

const INITIAL_SETTINGS: ActivitySettings = {
  dailyGoal: 10_000,
  phoneTrackingEnabled: false,
  shareScope: "activity"
};

const EMPTY_SYNC: ActivitySyncState = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  error: null
};

const INITIAL_LOAD_TIMEOUT_MS = 12_000;
const LIVE_STEP_REFRESH_MS = 10_000;

function localMidnight(timezone: string, dayOffset: number): number {
  const parts = getDayPartsInTimeZone(Date.now(), dayOffset, timezone);
  return zonedDateTimeToTimestamp(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    timezone
  );
}

function formatSyncTime(timestamp: number | null): string {
  if (timestamp == null) return "Not synced yet";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  }).format(new Date(timestamp));
}

function compactSteps(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString();
}

function SourceCard({
  icon: Icon,
  title,
  status,
  statusTone,
  description,
  detail,
  actionLabel,
  actionHint,
  actionVariant = "primary",
  actionDisabled = false,
  actionLoading = false,
  onAction
}: SourceCardProps) {
  const theme = useAnthraTheme();
  const tone = {
    success: {
      foreground: theme.colors.success,
      background: theme.colors.successSoft,
      icon: CircleCheck
    },
    warning: {
      foreground: theme.colors.warning,
      background: theme.colors.warningSoft,
      icon: TriangleAlert
    },
    neutral: {
      foreground: theme.colors.textSecondary,
      background: theme.colors.surfaceSubtle,
      icon: Clock3
    }
  }[statusTone];
  const StatusIcon = tone.icon;

  return (
    <Card>
      <View className="flex-row items-start" style={{ gap: theme.spacing.md }}>
        <View
          accessible={false}
          className="items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.brandSoft
          }}
        >
          <Icon accessible={false} color={theme.colors.brand} size={22} />
        </View>

        <View className="min-w-0 flex-1">
          <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>
            {title}
          </Text>
          <View
            accessible
            accessibilityLabel={`${title} status: ${status}`}
            className="mt-2 flex-row items-center self-start"
            style={{
              maxWidth: "100%",
              gap: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radii.full,
              backgroundColor: tone.background
            }}
          >
            <StatusIcon accessible={false} color={tone.foreground} size={14} />
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={[theme.typography.caption, { minWidth: 0, flexShrink: 1, color: tone.foreground, fontWeight: "600" }]}
            >
              {status}
            </Text>
          </View>
        </View>
      </View>

      <Text
        numberOfLines={4}
        style={[
          theme.typography.body,
          { color: theme.colors.textSecondary, marginTop: theme.spacing.md }
        ]}
      >
        {description}
      </Text>
      {detail ? (
        <Text
          numberOfLines={3}
          ellipsizeMode="tail"
          style={[
            theme.typography.caption,
            { color: theme.colors.textTertiary, marginTop: theme.spacing.sm }
          ]}
        >
          {detail}
        </Text>
      ) : null}

      <Button
        label={actionLabel}
        accessibilityHint={actionHint}
        variant={actionVariant}
        disabled={actionDisabled}
        loading={actionLoading}
        fullWidth
        onPress={onAction}
        style={{ marginTop: theme.spacing.lg }}
      />
    </Card>
  );
}

export function ActivityBuddyScreen({ onBack }: ActivityBuddyScreenProps) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { fontScale, width: viewportWidth } = useWindowDimensions();
  const shouldStackSummary = viewportWidth < 360 || fontScale >= 1.3;
  const shouldStackModalActions = viewportWidth < 380 || fontScale >= 1.2;
  const previewAvailableWidth = Math.max(0, viewportWidth - theme.spacing["2xl"]);
  const previewScale = Math.min(
    1,
    Math.max(0.5, previewAvailableWidth / ACTIVITY_STREAK_CARD_WIDTH)
  );
  const previewCardWidth = ACTIVITY_STREAK_CARD_WIDTH * previewScale;
  const previewCardHeight = ACTIVITY_STREAK_CARD_HEIGHT * previewScale;
  const [settings, setSettings] = useState<ActivitySettings>(INITIAL_SETTINGS);
  const [capabilities, setCapabilities] = useState<ActivityCapabilities | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStepStatus | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthConnectStatus | null>(null);
  const [summaries, setSummaries] = useState<ActivityDailySummary[]>([]);
  const [workouts, setWorkouts] = useState<StoredActivityWorkout[]>([]);
  const [anthraWorkoutDates, setAnthraWorkoutDates] = useState<Set<string>>(new Set());
  const [syncState, setSyncState] = useState<ActivitySyncState>(EMPTY_SYNC);
  const [loading, setLoading] = useState(true);
  const [initialLoadTimedOut, setInitialLoadTimedOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [goalSaving, setGoalSaving] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [sourceAction, setSourceAction] = useState<"phone" | "health" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);
  const refreshInFlight = useRef(false);
  const phoneRefreshInFlight = useRef(false);
  const refreshAttemptRef = useRef(0);
  const settingsRef = useRef<ActivitySettings>(INITIAL_SETTINGS);
  const settingsRevisionRef = useRef(0);
  const settingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

  const timezone = currentActivityTimezone();
  const todayKey = dateKeyInTimeZone(Date.now(), timezone);

  const refresh = useCallback(async (showSpinner = true, supersede = false) => {
    if (refreshInFlight.current && !supersede) return;
    const attempt = refreshAttemptRef.current + 1;
    refreshAttemptRef.current = attempt;
    const isCurrentAttempt = () => refreshAttemptRef.current === attempt;
    const settingsRevisionAtStart = settingsRevisionRef.current;
    refreshInFlight.current = true;
    if (showSpinner) setRefreshing(true);
    setNotice(null);

    try {
      await initActivityDatabase();
      await recordActivitySyncAttempt();
      const nextSettings = await getActivitySettings();
      if (
        isCurrentAttempt() &&
        settingsRevisionRef.current === settingsRevisionAtStart
      ) {
        settingsRef.current = nextSettings;
        setSettings(nextSettings);
      }

      const [nextCapabilities, nextPhoneStatus, nextHealthStatus] = await Promise.all([
        getActivityCapabilities(),
        getPhoneStepStatus().catch(() => null),
        getHealthConnectStatus()
      ]);
      if (isCurrentAttempt()) {
        setCapabilities(nextCapabilities);
        setPhoneStatus(nextPhoneStatus);
        setHealthStatus(nextHealthStatus);
      }

      const sourceErrors: string[] = [];
      if (
        nextSettings.phoneTrackingEnabled &&
        nextPhoneStatus?.sensorAvailable &&
        nextPhoneStatus.permissionGranted
      ) {
        try {
          const reading = await getCurrentPhoneStepReading(timezone);
          await savePhoneStepReading(reading);
          const pendingDays = await getPendingPhoneStepDays();
          if (pendingDays.length > 0) {
            await savePhoneStepDaySnapshots(pendingDays);
            await acknowledgePendingPhoneStepDays(
              pendingDays.map((day) => day.dateKey)
            );
          }
        } catch (error) {
          sourceErrors.push(
            error instanceof Error ? error.message : "Phone step refresh failed."
          );
        }
      }

      const healthRangeStart = localMidnight(timezone, -29);
      const healthRangeEnd = localMidnight(timezone, 1);
      if (nextHealthStatus.stepsPermission) {
        try {
          const totals = await readHealthConnectDailyTotals(
            healthRangeStart,
            healthRangeEnd,
            timezone
          );
          await saveHealthDailyTotals(totals);
        } catch (error) {
          // A failed current-day Health read must not leave an older partial
          // value overriding a newer phone-sensor total.
          await clearHealthConnectDailyTotals(todayKey);
          sourceErrors.push(
            error instanceof Error ? error.message : "Health Connect steps failed."
          );
        }
      } else {
        // Permission revocation removes Health Connect as an authoritative
        // source immediately, allowing locally tracked phone steps to surface.
        await clearHealthConnectDailyTotals();
      }
      if (nextHealthStatus.exercisePermission) {
        try {
          const records = await readHealthConnectWorkouts(
            healthRangeStart,
            healthRangeEnd
          );
          await replaceHealthWorkoutsInRange(
            records,
            healthRangeStart,
            healthRangeEnd,
            timezone
          );
        } catch (error) {
          sourceErrors.push(
            error instanceof Error ? error.message : "Health Connect workouts failed."
          );
        }
      }

      const [nextSummaries, nextWorkouts, nextAnthraDates] = await Promise.all([
        getActivityDailySummaries("0000-01-01"),
        getStoredActivityWorkouts("0000-01-01"),
        getAnthraWorkoutDateKeys(0, timezone)
      ]);
      if (isCurrentAttempt()) {
        setSummaries(nextSummaries);
        setWorkouts(nextWorkouts);
        setAnthraWorkoutDates(nextAnthraDates);
      }

      if (sourceErrors.length > 0) {
        const message = sourceErrors.join(" ");
        await recordActivitySyncFailure(message);
        if (isCurrentAttempt()) setNotice(message);
      } else {
        await recordActivitySyncSuccess();
      }
      const nextSyncState = await getActivitySyncState();
      if (isCurrentAttempt()) setSyncState(nextSyncState);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Activity could not refresh.";
      await recordActivitySyncFailure(message).catch(() => undefined);
      const nextSyncState = await getActivitySyncState().catch(() => EMPTY_SYNC);
      if (isCurrentAttempt()) {
        setNotice(message);
        setSyncState(nextSyncState);
      }
    } finally {
      if (isCurrentAttempt()) {
        refreshInFlight.current = false;
        setLoading(false);
        setInitialLoadTimedOut(false);
        setRefreshing(false);
      }
    }
  }, [timezone, todayKey]);

  const refreshLivePhoneSteps = useCallback(async () => {
    if (
      refreshInFlight.current ||
      phoneRefreshInFlight.current ||
      !settingsRef.current.phoneTrackingEnabled ||
      AppState.currentState !== "active"
    ) return;

    phoneRefreshInFlight.current = true;
    try {
      const reading = await getCurrentPhoneStepReading(timezone);
      await savePhoneStepReading(reading);
      const pendingDays = await getPendingPhoneStepDays();
      if (pendingDays.length > 0) {
        await savePhoneStepDaySnapshots(pendingDays);
        await acknowledgePendingPhoneStepDays(pendingDays.map((day) => day.dateKey));
      }

      const changedDateKeys = new Set([
        reading.dateKey,
        ...pendingDays.map((day) => day.dateKey)
      ]);
      const changedSummaries = (
        await Promise.all([...changedDateKeys].map(getActivityDailySummary))
      ).filter((summary): summary is ActivityDailySummary => summary != null);
      if (changedSummaries.length > 0) {
        setSummaries((current) => {
          const merged = new Map(current.map((summary) => [summary.dateKey, summary]));
          changedSummaries.forEach((summary) => merged.set(summary.dateKey, summary));
          return [...merged.values()].sort((left, right) =>
            left.dateKey.localeCompare(right.dateKey)
          );
        });
      }
      setPhoneStatus((current) => current ? {
        ...current,
        dateKey: reading.dateKey,
        timezone: reading.timezone,
        lastRaw: reading.raw,
        steps: reading.steps
      } : current);
    } catch {
      // The full foreground refresh owns user-facing source error reporting.
    } finally {
      phoneRefreshInFlight.current = false;
    }
  }, [timezone]);

  useEffect(() => {
    refresh(false).catch(() => undefined);
    return () => {
      refreshAttemptRef.current += 1;
      refreshInFlight.current = false;
      cancelCurrentPhoneStepReading();
    };
  }, [refresh]);

  useEffect(() => {
    if (!loading || initialLoadTimedOut) return;
    const timer = setTimeout(() => setInitialLoadTimedOut(true), INITIAL_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [initialLoadTimedOut, loading]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh(false).catch(() => undefined);
      } else {
        cancelCurrentPhoneStepReading();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    let observedDate = todayKey;
    const timer = setInterval(() => {
      const currentDate = dateKeyInTimeZone(Date.now(), timezone);
      if (currentDate !== observedDate) {
        observedDate = currentDate;
        refresh(false).catch(() => undefined);
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh, timezone, todayKey]);

  useEffect(() => {
    if (!settings.phoneTrackingEnabled) return;
    const timer = setInterval(() => {
      refreshLivePhoneSteps().catch(() => undefined);
    }, LIVE_STEP_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshLivePhoneSteps, settings.phoneTrackingEnabled]);

  const todaySummary = useMemo(
    () => summaries.find((summary) => summary.dateKey === todayKey),
    [summaries, todayKey]
  );
  const todaySteps = todaySummary?.authoritativeSteps ?? 0;
  const publishedGoalKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const milestoneKey = `${todayKey}:${settings.dailyGoal}`;
    if (todaySteps < settings.dailyGoal || publishedGoalKeyRef.current === milestoneKey || !supabase) return;
    publishedGoalKeyRef.current = milestoneKey;
    publishTodaySocialStats(supabase).catch(() => {
      publishedGoalKeyRef.current = null;
    });
  }, [settings.dailyGoal, todayKey, todaySteps]);
  const activityDateKeys = useMemo(
    () => qualifyingActivityDateKeys(summaries, workouts, settings.dailyGoal),
    [settings.dailyGoal, summaries, workouts]
  );
  const allActivityDateKeys = useMemo(
    () => unionActivityDateKeys(activityDateKeys, anthraWorkoutDates),
    [activityDateKeys, anthraWorkoutDates]
  );
  const activityStreak = calculateActivityStreak(activityDateKeys, todayKey);
  const activityWeekDays = activeDaysThisWeek(activityDateKeys, todayKey);
  const shareDates =
    settings.shareScope === "all" ? allActivityDateKeys : activityDateKeys;
  const shareStreak = calculateActivityStreak(shareDates, todayKey);
  const shareWeekDays = activeDaysThisWeek(shareDates, todayKey);
  const progress = Math.min(100, (todaySteps / Math.max(1, settings.dailyGoal)) * 100);
  const visibleSummaries = useMemo(() => {
    const keys = new Set(recentDateKeys(todayKey, 7));
    return summaries.filter((summary) => keys.has(summary.dateKey));
  }, [summaries, todayKey]);
  const hasRecentStepData = visibleSummaries.some(
    (summary) => summary.authoritativeSteps > 0
  );
  const isStale =
    syncState.lastSuccessAt != null &&
    Date.now() - syncState.lastSuccessAt > 12 * 60 * 60 * 1000;
  const sourceLabel =
    todaySummary?.authoritativeSource === "health_connect"
      ? "Health Connect aggregated steps"
      : todaySummary?.authoritativeSource === "phone_sensor"
        ? "This phone’s step sensor"
        : "No step source yet";
  const shareSourceLabel =
    settings.shareScope === "all"
      ? `${sourceLabel} + Anthra workouts`
      : sourceLabel;
  const connectedPackages = useMemo(
    () =>
      [
        ...new Set([
          ...(todaySummary?.sourcePackages ?? []),
          ...workouts.map((workout) => workout.originPackage)
        ])
      ].sort(),
    [todaySummary?.sourcePackages, workouts]
  );

  const phoneAvailable = capabilities?.stepCounterAvailable === true;
  const phoneEnabled = settings.phoneTrackingEnabled && phoneStatus?.permissionGranted === true;
  const phoneNeedsAttention = settings.phoneTrackingEnabled && !phoneEnabled;
  const phoneDescription = !phoneAvailable
    ? "This phone does not expose a compatible hardware step counter."
    : phoneStatus?.permissionGranted
      ? settings.phoneTrackingEnabled
        ? "Anthra keeps the low-power step sensor active in the background, including when the app is closed. Android shows a quiet ongoing notification while tracking."
        : "Available on this device. Access is requested only when you choose to enable it."
      : settings.phoneTrackingEnabled
        ? "Physical activity access was removed. Enable it again to resume phone steps."
        : "Off. Anthra has not requested physical activity access."
  const healthUnavailable =
    healthStatus?.availability === "unavailable" ||
    healthStatus?.availability === "unsupported_os";
  const healthHasPermission =
    healthStatus?.stepsPermission === true || healthStatus?.exercisePermission === true;
  const healthDescription = healthStatus?.connected
    ? "Connected activity apps provide the authoritative step total and eligible workouts."
    : healthStatus?.availability === "update_required"
      ? "Install or update Health Connect to bring in watches and fitness apps."
      : healthUnavailable
        ? "Health Connect is not available on this Android device."
        : healthHasPermission
          ? "Some activity access is enabled. Manage access to include every visible source."
          : "Connect compatible watches and fitness apps while keeping their records on this device.";
  const healthActionLabel =
    healthStatus?.availability === "update_required"
      ? "Update Health Connect"
      : healthHasPermission
        ? "Manage Health Data"
        : "Connect Health Data";

  const updateSettings = useCallback(async (
    createNext: (current: ActivitySettings) => ActivitySettings
  ) => {
    settingsRevisionRef.current += 1;
    const write = settingsWriteQueueRef.current.then(async () => {
      const next = createNext(settingsRef.current);
      await saveActivitySettings(next);
      settingsRef.current = next;
      setSettings(next);
    });
    settingsWriteQueueRef.current = write.catch(() => undefined);
    await write;
  }, []);

  const changeGoal = async (delta: number) => {
    if (goalSaving) return;
    setGoalSaving(true);
    setNotice(null);
    try {
      await updateSettings((current) => ({
        ...current,
        dailyGoal: Math.min(50_000, Math.max(1_000, current.dailyGoal + delta))
      }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update the daily goal.");
    } finally {
      setGoalSaving(false);
    }
  };

  const togglePhoneTracking = async () => {
    if (sourceAction) return;
    setSourceAction("phone");
    setNotice(null);
    try {
      if (settings.phoneTrackingEnabled) {
        await disablePhoneStepTracking();
        await updateSettings((current) => ({ ...current, phoneTrackingEnabled: false }));
        await refresh(false);
        return;
      }
      const enabled = await enablePhoneStepTracking();
      if (!enabled) {
        setNotice(
          capabilities?.stepCounterAvailable
            ? "Physical activity permission was denied. Phone steps remain off."
            : "This device has no hardware step-counter sensor."
        );
        return;
      }
      await updateSettings((current) => ({ ...current, phoneTrackingEnabled: true }));
      await refresh(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Phone step tracking could not be changed.");
    } finally {
      setSourceAction(null);
    }
  };

  const handleHealthAction = async () => {
    if (sourceAction || healthUnavailable) return;
    setSourceAction("health");
    setNotice(null);
    try {
      if (healthStatus?.availability === "update_required" || healthHasPermission) {
        await openHealthConnectSettings();
      } else {
        await requestHealthConnectPermissions();
        await refresh(false);
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Health Connect access could not be changed."
      );
    } finally {
      setSourceAction(null);
    }
  };

  const changeShareScope = async (scope: ActivityShareScope) => {
    if (scopeSaving || settings.shareScope === scope) return;
    setScopeSaving(true);
    setNotice(null);
    try {
      await updateSettings((current) => ({ ...current, shareScope: scope }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save the sharing preference.");
    } finally {
      setScopeSaving(false);
    }
  };

  const retryInitialLoad = () => {
    cancelCurrentPhoneStepReading();
    setInitialLoadTimedOut(false);
    setNotice(null);
    refresh(false, true).catch(() => undefined);
  };

  const openSharePreview = () => {
    setShareError(null);
    setSharePreviewOpen(true);
  };

  const closeSharePreview = () => {
    if (sharing) return;
    setShareError(null);
    setSharePreviewOpen(false);
  };

  const shareConfirmed = async () => {
    if (!shareCardRef.current || sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("System sharing is not available on this device.");
      }
      const uri = await captureRef(shareCardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: 1080,
        height: 1440
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: "Share Activity Streak"
      });
      setSharePreviewOpen(false);
      setShareError(null);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not share Activity Streak.");
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
        <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
          <View
            style={{
              width: "100%",
              maxWidth: theme.layout.contentMaxWidth,
              alignSelf: "center",
              paddingHorizontal: theme.layout.screenPadding
            }}
          >
            <ScreenHeader
              title="Activity"
              eyebrow="PRIVATE · ON DEVICE"
              onBack={onBack}
              backLabel="Back to Anthra home"
            />
          </View>
        </View>

        <View
          className="flex-1 items-center justify-center"
          style={{ paddingHorizontal: theme.spacing["3xl"] }}
        >
          {initialLoadTimedOut ? (
            <View style={{ width: "100%", maxWidth: 420 }}>
              <StatusBanner
                title="Activity is taking longer than expected"
                message="A device activity service may not be responding. You can retry safely or return to Anthra."
                variant="warning"
              />
              <Button
                label="Retry Activity"
                icon={RefreshCw}
                fullWidth
                onPress={retryInitialLoad}
                style={{ marginTop: theme.spacing.lg }}
              />
              <Button
                label="Back to Anthra"
                variant="ghost"
                fullWidth
                onPress={onBack}
                style={{ marginTop: theme.spacing.sm }}
              />
            </View>
          ) : (
            <View accessibilityLabel="Loading Activity dashboard" accessibilityState={{ busy: true }} style={{ width: "100%", maxWidth: theme.layout.contentMaxWidth, gap: theme.spacing.lg }}>
              <SkeletonCard rows={2} />
              <SkeletonCard rows={3} />
              <SkeletonCard rows={2} />
            </View>
          )}
        </View>
      </ScreenLayout>
    );
  }

  const syncTitle = syncState.error
    ? "Last refresh was incomplete"
    : isStale
      ? "Activity may be out of date"
      : "Activity is up to date";
  const syncMessage = `Last successful refresh: ${formatSyncTime(syncState.lastSuccessAt)}.`;

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
      <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
        <View
          style={{
            width: "100%",
            maxWidth: theme.layout.contentMaxWidth,
            alignSelf: "center",
            paddingHorizontal: theme.layout.screenPadding
          }}
        >
          <ScreenHeader
            title="Activity"
            eyebrow="PRIVATE · ON DEVICE"
            subtitle="Steps, movement and streaks at a glance."
            onBack={onBack}
            backLabel="Back to Anthra home"
            action={
              <IconButton
                icon={RefreshCw}
                accessibilityLabel="Refresh activity data"
                accessibilityHint="Reads the activity sources currently enabled"
                accessibilityState={{ busy: refreshing }}
                disabled={refreshing}
                onPress={() => refresh(true)}
              />
            }
          />
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.xl,
          paddingBottom: theme.spacing["4xl"]
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => refresh(true)}
            tintColor={theme.colors.brand}
            colors={[theme.colors.brand]}
            progressBackgroundColor={theme.colors.surface}
          />
        }
      >
        {notice ? (
          <StatusBanner
            title="Some activity data needs attention"
            message={notice}
            variant="danger"
            style={{ marginBottom: theme.spacing.lg }}
          />
        ) : null}

        <Card variant="elevated" padding="large">
          <View
            style={{
              flexDirection: shouldStackSummary ? "column" : "row",
              alignItems: shouldStackSummary ? "stretch" : "flex-start",
              gap: theme.spacing.lg
            }}
          >
            <View
              accessible
              accessibilityLabel={`${compactSteps(todaySteps)} steps today. ${sourceLabel}.`}
              className="min-w-0 flex-1"
            >
              <View className="flex-row items-center" style={{ gap: theme.spacing.sm }}>
                <Footprints accessible={false} color={theme.colors.brand} size={20} />
                <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>
                  TODAY’S STEPS
                </Text>
              </View>
              <Text
                style={[
                  theme.typography.display,
                  { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }
                ]}
              >
                {compactSteps(todaySteps)}
              </Text>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }
                ]}
              >
                {sourceLabel}
              </Text>
            </View>

            <Card
              accessible
              accessibilityLabel={`${activityStreak} day activity streak`}
              treatment="stat"
              variant="brand"
              padding="small"
              className="items-end"
              style={{ minWidth: 92, alignSelf: shouldStackSummary ? "stretch" : "auto" }}
            >
              <Text style={[theme.typography.headline, { color: theme.colors.brand }]}>
                {activityStreak}
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                day streak
              </Text>
            </Card>
          </View>

          <ProgressBar
            value={todaySteps}
            max={settings.dailyGoal}
            accessibilityLabel="Daily step goal progress"
            accessibilityValueText={`${Math.round(progress)} percent, ${compactSteps(todaySteps)} of ${compactSteps(settings.dailyGoal)} steps`}
            height={10}
            style={{ marginTop: theme.spacing.xl }}
          />

          <View
            className="mt-3 flex-row items-center justify-between"
            style={{ gap: theme.spacing.md }}
          >
            <View className="min-w-0 flex-1">
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>
                {Math.round(progress)}% of your goal
              </Text>
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                Goal · {compactSteps(settings.dailyGoal)} steps
              </Text>
            </View>
            <View className="flex-row" style={{ gap: theme.spacing.sm }}>
              <IconButton
                icon={Minus}
                size="small"
                accessibilityLabel="Decrease daily step goal by 1,000"
                accessibilityHint={`Current goal is ${compactSteps(settings.dailyGoal)} steps`}
                disabled={goalSaving || settings.dailyGoal <= 1_000}
                onPress={() => changeGoal(-1_000)}
              />
              <IconButton
                icon={Plus}
                size="small"
                accessibilityLabel="Increase daily step goal by 1,000"
                accessibilityHint={`Current goal is ${compactSteps(settings.dailyGoal)} steps`}
                disabled={goalSaving || settings.dailyGoal >= 50_000}
                onPress={() => changeGoal(1_000)}
              />
            </View>
          </View>
        </Card>

        <View style={{ marginTop: theme.spacing["2xl"] }}>
          <SectionHeader
            title="Seven-day rhythm"
            meta={`${activityWeekDays}/7 active days`}
          />
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }
            ]}
          >
            Daily steps compared with your current goal.
          </Text>

          <Card style={{ marginTop: theme.spacing.md }}>
            {hasRecentStepData ? (
              <ActivityHistoryChart
                todayKey={todayKey}
                summaries={visibleSummaries}
                dailyGoal={settings.dailyGoal}
              />
            ) : (
              <EmptyState
                icon={Footprints}
                title="No step history yet"
                description="Enable a source below, then refresh after moving."
                variant="inline"
                style={{ paddingVertical: theme.spacing.xl }}
              />
            )}
          </Card>
        </View>

        <View style={{ marginTop: theme.spacing["3xl"] }}>
          <SectionHeader title="Data sources" />
          <Text
            style={[
              theme.typography.body,
              { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }
            ]}
          >
            You decide which sources Anthra can read.
          </Text>

          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
            <SourceCard
              icon={Footprints}
              title="Phone step counter"
              status={
                !phoneAvailable
                  ? "Unavailable"
                  : phoneEnabled
                    ? "On"
                    : phoneNeedsAttention
                      ? "Needs attention"
                      : "Off"
              }
              statusTone={
                phoneEnabled ? "success" : phoneNeedsAttention ? "warning" : "neutral"
              }
              description={phoneDescription}
              actionLabel={settings.phoneTrackingEnabled ? "Turn Off Phone Steps" : "Enable Phone Steps"}
              actionHint="Changes access to this phone’s hardware step sensor"
              actionVariant={settings.phoneTrackingEnabled ? "outline" : "primary"}
              actionDisabled={!phoneAvailable || sourceAction === "health"}
              actionLoading={sourceAction === "phone"}
              onAction={() => togglePhoneTracking()}
            />

            <SourceCard
              icon={HeartPulse}
              title="Health Connect"
              status={
                healthStatus?.connected
                  ? "Connected"
                  : healthStatus?.availability === "update_required"
                    ? "Update required"
                    : healthUnavailable
                      ? "Unavailable"
                      : healthHasPermission
                        ? "Partial access"
                        : "Not connected"
              }
              statusTone={
                healthStatus?.connected
                  ? "success"
                  : healthStatus?.availability === "update_required" || healthHasPermission
                    ? "warning"
                    : "neutral"
              }
              description={healthDescription}
              detail={connectedPackages.length > 0 ? `Sources · ${connectedPackages.join(", ")}` : undefined}
              actionLabel={healthActionLabel}
              actionHint="Opens Android Health Connect permission controls"
              actionVariant={healthHasPermission ? "outline" : "primary"}
              actionDisabled={healthUnavailable || sourceAction === "phone"}
              actionLoading={sourceAction === "health"}
              onAction={() => handleHealthAction()}
            />
          </View>
        </View>

        <View style={{ marginTop: theme.spacing["3xl"] }}>
          <Text style={[theme.typography.titleMedium, { color: theme.colors.textPrimary }]}>
            Data health
          </Text>
          <StatusBanner
            title={syncTitle}
            message={syncMessage}
            variant={syncState.error ? "danger" : isStale ? "warning" : "success"}
            style={{ marginTop: theme.spacing.md }}
          />

          <Card
            treatment="inset"
            style={{ marginTop: theme.spacing.md }}
          >
            <View className="flex-row items-start" style={{ gap: theme.spacing.md }}>
              <LockKeyhole accessible={false} color={theme.colors.brand} size={21} />
              <View className="min-w-0 flex-1">
                <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>
                  Private by design
                </Text>
                <Text
                  style={[
                    theme.typography.body,
                    { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }
                  ]}
                >
                  Health records stay on this device. Step and workout activity tables are included in Anthra JSON backups (v5+); they are not uploaded to friends or cloud social features unless you opt in to share specific stats. Step counts are estimates, not medical measurements.
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <Card
          variant="brand"
          style={{ marginTop: theme.spacing["3xl"] }}
        >
          <View className="flex-row items-start" style={{ gap: theme.spacing.md }}>
            <View
              className="items-center justify-center"
              style={{
                width: 44,
                height: 44,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.surface
              }}
            >
              <Share2 accessible={false} color={theme.colors.brand} size={21} />
            </View>
            <View className="min-w-0 flex-1">
              <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>
                Share your momentum
              </Text>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }
                ]}
              >
                Choose what counts toward the card. You’ll always preview it before sharing.
              </Text>
            </View>
          </View>

          <ChoiceRow
            label="INCLUDED ACTIVITY"
            options={[
              { label: "Steps + health", value: "activity" },
              { label: "All activity", value: "all" }
            ]}
            value={settings.shareScope}
            onChange={(scope) => {
              changeShareScope(scope).catch(() => undefined);
            }}
            layout="equal"
            style={{ marginTop: theme.spacing.lg }}
          />

          <Button
            label="Preview Share Card"
            icon={Share2}
            accessibilityHint="Opens a private preview before the system share sheet"
            fullWidth
            onPress={openSharePreview}
            style={{ marginTop: theme.spacing.md }}
          />
        </Card>
      </ScrollView>

      <SheetDialog visible={sharePreviewOpen} title="Share preview" subtitle="Nothing is shared until you confirm." onClose={closeSharePreview} backdropDismissEnabled={!sharing} error={shareError} primaryAction={{ label: "Share now", icon: Share2, onPress: shareConfirmed, loading: sharing }} secondaryAction={{ label: "Cancel", onPress: closeSharePreview, disabled: sharing }}>
            <View className="items-center" style={{ width: "100%" }}>
              <View
                style={{
                  width: previewCardWidth,
                  height: previewCardHeight,
                  marginTop: theme.spacing.lg
                }}
              >
                <View
                  ref={shareCardRef}
                  collapsable={false}
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: ACTIVITY_STREAK_CARD_WIDTH,
                    height: ACTIVITY_STREAK_CARD_HEIGHT,
                    left: (previewCardWidth - ACTIVITY_STREAK_CARD_WIDTH) / 2,
                    top: (previewCardHeight - ACTIVITY_STREAK_CARD_HEIGHT) / 2,
                    transform: [{ scale: previewScale }]
                  }}
                >
                  <ActivityStreakCard
                    scope={settings.shareScope}
                    streak={shareStreak}
                    todaySteps={todaySteps}
                    dailyGoal={settings.dailyGoal}
                    activeDaysThisWeek={shareWeekDays}
                    sourceLabel={shareSourceLabel}
                    accentColor={theme.colors.brand}
                  />
                </View>
              </View>

            </View>
      </SheetDialog>
    </ScreenLayout>
  );
}
