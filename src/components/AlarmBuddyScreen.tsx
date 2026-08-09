import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AlarmClock,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Music2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2
} from "lucide-react-native";

import { formatDays, normalizeDays } from "../constants/schedule";
import { ScreenLayout, useScreenBackgrounds } from "./layout";
import { useAnthraTheme } from "../design-system";
import {
  deleteAlarmItem,
  getAlarmHistory,
  getAlarmItems,
  saveAlarmCompletionEvents,
  saveAlarmItem,
  setAlarmItemEnabled
} from "../db";
import type { AlarmHistoryEntry, AlarmInput, AlarmItem } from "../types";
import {
  cancelNativeAlarm,
  consumeNativeAlarmCompletions,
  getAlarmPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  pickNativeAlarmSound,
  scheduleNativeAlarm,
  startPushupTrackingTest,
  type AlarmPermissionStatus
} from "../utils/alarmNative";
import { getDayPartsInTimeZone, zonedDateTimeToTimestamp } from "../utils/timezone";
import {
  AnimatedPressable,
  Button,
  Card,
  ChoiceRow,
  EmptyState,
  IconButton,
  KeyboardAwareScrollView,
  ScreenHeader,
  SectionHeader,
  SheetDialog,
  StatusBanner,
  TextField,
  TimePickerField,
  WeekdayPicker
} from "./ui";

const ALARM_TIMEZONE = "Asia/Kolkata";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

type AlarmBuddyScreenProps = {
  onBack: () => void;
};

type AlarmForm = {
  id?: number;
  enabled: boolean;
  label: string;
  hour: number;
  minute: number;
  days: number[];
  pushupTarget: string;
  soundUri: string;
  soundName: string;
};

type AlarmSetupStatus = AlarmPermissionStatus & {
  cameraGranted: boolean;
  notificationsGranted: boolean;
};

const DEFAULT_FORM: AlarmForm = {
  enabled: true,
  label: "Wake up and move",
  hour: 7,
  minute: 0,
  days: EVERY_DAY,
  pushupTarget: "10",
  soundUri: "",
  soundName: "System alarm"
};

function alarmTimeLabel(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatIstTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: ALARM_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(timestamp));
}

function nextAlarmTimestamp(alarm: AlarmItem, now = Date.now()): number | null {
  const daySet = new Set(normalizeDays(alarm.days));
  for (let offset = 0; offset <= 8; offset += 1) {
    const day = getDayPartsInTimeZone(now, offset, ALARM_TIMEZONE);
    if (!daySet.has(day.weekday)) continue;
    const timestamp = zonedDateTimeToTimestamp(
      day.year,
      day.month,
      day.day,
      alarm.hour,
      alarm.minute,
      ALARM_TIMEZONE
    );
    if (timestamp > now + 1_000) return timestamp;
  }
  return null;
}

function isAlarmSetupReady(status: AlarmSetupStatus): boolean {
  return status.nativeSupported
    && status.exactAlarm
    && status.fullScreenIntent
    && status.cameraGranted
    && status.notificationsGranted;
}

function isSavedAttentionNotice(message: string | null): boolean {
  return Boolean(message?.startsWith("Saved, but needs attention:") || message === "Saved, but could not schedule.");
}

function formatTimeRemaining(timestamp: number, now: number): string {
  const totalSeconds = Math.max(0, Math.ceil((timestamp - now) / 1_000));
  if (totalSeconds === 0) return "Ringing now";
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${String(seconds).padStart(2, "0")}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function AlarmBuddyScreen({ onBack }: AlarmBuddyScreenProps) {
  const anthraTheme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { colors, layout, radii, spacing, typography } = anthraTheme;
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [history, setHistory] = useState<AlarmHistoryEntry[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<AlarmPermissionStatus | null>(null);
  const [cameraGranted, setCameraGranted] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(Platform.OS === "android" && Number(Platform.Version) < 33);
  const [editorOpen, setEditorOpen] = useState(false);
  const pushupTargetInputRef = useRef<TextInput>(null);
  const [form, setForm] = useState<AlarmForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [soundPicking, setSoundPicking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [setupGuideExpanded, setSetupGuideExpanded] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const refreshPermissionStatus = useCallback(async (): Promise<AlarmSetupStatus> => {
    const [nativeStatus, hasCamera, hasNotifications] = await Promise.all([
      getAlarmPermissionStatus(),
      Platform.OS === "android"
        ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
        : Promise.resolve(false),
      Platform.OS === "android" && Number(Platform.Version) >= 33
        ? PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
        : Promise.resolve(Platform.OS === "android")
    ]);
    setPermissionStatus(nativeStatus);
    setCameraGranted(hasCamera);
    setNotificationsGranted(hasNotifications);
    return {
      ...nativeStatus,
      cameraGranted: hasCamera,
      notificationsGranted: hasNotifications
    };
  }, []);

  const refresh = useCallback(async () => {
    const completionEvents = await consumeNativeAlarmCompletions();
    if (completionEvents.length > 0) await saveAlarmCompletionEvents(completionEvents);
    const [nextAlarms, nextHistory] = await Promise.all([getAlarmItems(), getAlarmHistory()]);
    setAlarms(nextAlarms);
    setHistory(nextHistory);
    return nextAlarms;
  }, []);

  const retryEnabledAlarms = useCallback(async (items: AlarmItem[], status: AlarmSetupStatus) => {
    if (!isAlarmSetupReady(status)) return false;
    await Promise.all(items.filter((item) => item.enabled).map((item) => scheduleNativeAlarm(item)));
    setNotice((current) => isSavedAttentionNotice(current) ? null : current);
    return true;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Promise.all([refresh(), refreshPermissionStatus()])
      .then(([items, status]) => retryEnabledAlarms(items, status))
      .catch((error) => setNotice(error instanceof Error ? error.message : "Could not load alarms."));
  }, [refresh, refreshPermissionStatus, retryEnabledAlarms]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      Promise.all([refresh(), refreshPermissionStatus()])
        .then(([items, status]) => retryEnabledAlarms(items, status))
        .catch((error) => setNotice(error instanceof Error ? `Saved, but needs attention: ${error.message}` : "Saved, but could not schedule."));
    });
    return () => subscription.remove();
  }, [refresh, refreshPermissionStatus, retryEnabledAlarms]);

  const enabledCount = useMemo(() => alarms.filter((alarm) => alarm.enabled).length, [alarms]);

  const openEditor = (alarm?: AlarmItem) => {
    setNotice(null);
    setEditorError(null);
    setForm(
      alarm
        ? {
            id: alarm.id,
            enabled: alarm.enabled,
            label: alarm.label,
            hour: alarm.hour,
            minute: alarm.minute,
            days: alarm.days,
            pushupTarget: String(alarm.pushupTarget),
            soundUri: alarm.soundUri,
            soundName: alarm.soundName
          }
        : { ...DEFAULT_FORM, days: [...EVERY_DAY] }
    );
    setEditorOpen(true);
  };

  const requestRuntimePermissions = async () => {
    if (Platform.OS !== "android") return;
    const requested = [PermissionsAndroid.PERMISSIONS.CAMERA];
    if (Number(Platform.Version) >= 33) {
      requested.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }
    await PermissionsAndroid.requestMultiple(requested);
    const [status, items] = await Promise.all([refreshPermissionStatus(), getAlarmItems()]);
    await retryEnabledAlarms(items, status);
  };

  const handlePickSound = async () => {
    setSoundPicking(true);
    try {
      const selected = await pickNativeAlarmSound(form.soundUri);
      setForm((current) => ({ ...current, soundUri: selected.uri, soundName: selected.name }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not choose alarm sound.";
      if (!/cancel/i.test(message)) Alert.alert("Sound picker", message);
    } finally {
      setSoundPicking(false);
    }
  };

  const handleSave = async () => {
    setEditorError(null);
    const pushupTarget = Math.floor(Number(form.pushupTarget));
    if (!Number.isFinite(pushupTarget) || pushupTarget < 1 || pushupTarget > 100) {
      setEditorError("Choose a target between 1 and 100 push-ups.");
      return;
    }
    if (normalizeDays(form.days).length === 0) {
      setEditorError("Choose at least one repeat day for this alarm.");
      return;
    }
    setSaving(true);
    try {
      const alarmInput: AlarmInput = {
        id: form.id,
        label: form.label,
        hour: form.hour,
        minute: form.minute,
        days: form.days,
        pushupTarget,
        soundUri: form.soundUri,
        soundName: form.soundName,
        enabled: form.enabled
      };
      const id = await saveAlarmItem(alarmInput);
      const nextAlarms = await getAlarmItems();
      const saved = nextAlarms.find((alarm) => alarm.id === id);
      if (!saved) throw new Error("Alarm was saved but could not be loaded.");
      let message: string;
      if (saved.enabled) {
        try {
          const result = await scheduleNativeAlarm(saved);
          message = `Alarm set for ${formatIstTimestamp(result.nextTriggerAt)}.`;
        } catch (error) {
          message = error instanceof Error ? `Saved, but needs attention: ${error.message}` : "Saved, but could not schedule.";
        }
      } else {
        try {
          await cancelNativeAlarm(saved.id);
          message = "Changes saved. This alarm remains off.";
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Its device schedule could not be cleared.";
          message = `Saved, but needs attention: This alarm remains off in Anthra. ${detail}`;
        }
      }
      setAlarms(nextAlarms);
      setEditorOpen(false);
      setNotice(message);
      await refreshPermissionStatus();
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Could not save the alarm. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (alarm: AlarmItem) => {
    const nextEnabled = !alarm.enabled;
    await setAlarmItemEnabled(alarm.id, nextEnabled);
    const updated = { ...alarm, enabled: nextEnabled };
    if (nextEnabled) {
      try {
        await scheduleNativeAlarm(updated);
        setNotice("Alarm enabled.");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Alarm saved but not scheduled.");
      }
    } else {
      await cancelNativeAlarm(alarm.id).catch(() => undefined);
      setNotice("Alarm disabled.");
    }
    await refresh();
  };

  const handleDelete = (alarm: AlarmItem) => {
    Alert.alert("Delete alarm?", `Delete “${alarm.label}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          Promise.all([cancelNativeAlarm(alarm.id).catch(() => undefined), deleteAlarmItem(alarm.id)])
            .then(() => refresh())
            .catch((error) => Alert.alert("Could not delete alarm", error instanceof Error ? error.message : "Try again."));
        }
      }
    ]);
  };

  const handleTestTracker = async (target: number) => {
    try {
      if (!cameraGranted) {
        await requestRuntimePermissions();
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
        if (!granted) {
          Alert.alert("Camera required", "Allow camera access so Anthra can count push-ups on your device.");
          return;
        }
      }
      await startPushupTrackingTest(target);
    } catch (error) {
      Alert.alert("Tracker unavailable", error instanceof Error ? error.message : "Use an Android development build.");
    }
  };

  const setupNeedsAttention = Boolean(
    permissionStatus
      && (
        !permissionStatus.nativeSupported
        || !permissionStatus.exactAlarm
        || !permissionStatus.fullScreenIntent
        || !cameraGranted
        || !notificationsGranted
      )
  );
  const noticeNeedsAttention = isSavedAttentionNotice(notice)
    || Boolean(notice && /could not|not scheduled|attention|unavailable|permission|required|allow/i.test(notice));
  const setupStatusLabel = permissionStatus == null
    ? "Checking…"
    : setupNeedsAttention
      ? "Needs attention"
      : "Ready";
  const setupStatusColor = permissionStatus == null
    ? colors.textSecondary
    : setupNeedsAttention
      ? colors.brand
      : colors.success;
  const setupStatusBackground = permissionStatus == null
    ? colors.surfaceSubtle
    : setupNeedsAttention
      ? colors.brandSoft
      : colors.successSoft;

  useEffect(() => {
    if (setupNeedsAttention) setSetupGuideExpanded(true);
  }, [setupNeedsAttention]);

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
      <View
        style={{
          paddingHorizontal: layout.screenPadding,
          borderBottomWidth: 1,
          borderBottomColor: colors.divider,
          backgroundColor: colors.canvas
        }}
      >
        <ScreenHeader
          eyebrow="ORGANIZE"
          title="Alarms"
          subtitle={`${enabledCount} active · motion-verified wakeups`}
          onBack={onBack}
          backLabel="Back to Anthra hub"
          style={{ width: "100%", maxWidth: layout.contentMaxWidth, alignSelf: "center" }}
          action={
            <IconButton
              icon={Plus}
              accessibilityLabel="Create a new alarm"
              variant="primary"
              onPress={() => openEditor()}
            />
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={{
          width: "100%",
          maxWidth: layout.contentMaxWidth,
          alignSelf: "center",
          padding: layout.screenPadding,
          paddingBottom: spacing["5xl"]
        }}
      >
        <View
          style={{
            overflow: "hidden",
            borderRadius: radii.xl,
            borderWidth: 1,
            borderColor: setupNeedsAttention ? colors.brandBorder : colors.border,
            backgroundColor: colors.surfaceElevated
          }}
        >
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ expanded: setupGuideExpanded }}
            accessibilityLabel={`Alarm readiness, ${setupStatusLabel}`}
            accessibilityHint={setupGuideExpanded ? "Collapses alarm setup and camera test" : "Shows alarm setup and camera test"}
            onPress={() => setSetupGuideExpanded((expanded) => !expanded)}
            className="min-h-[58px] flex-row items-center px-4 py-3"
            style={({ pressed }) => ({ backgroundColor: pressed ? colors.surfacePressed : colors.surfaceElevated })}
          >
            <View
              className="items-center justify-center"
              style={{ width: 38, height: 38, flexShrink: 0, borderRadius: radii.md, backgroundColor: setupStatusBackground }}
            >
              {permissionStatus == null ? (
                <AlarmClock accessible={false} color={setupStatusColor} size={20} />
              ) : setupNeedsAttention ? (
                <CircleAlert accessible={false} color={setupStatusColor} size={20} />
              ) : (
                <ShieldCheck accessible={false} color={setupStatusColor} size={20} />
              )}
            </View>
            <View className="min-w-0 flex-1" style={{ marginLeft: spacing.md }}>
              <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>Alarm readiness</Text>
              <Text style={[typography.caption, { color: setupStatusColor, marginTop: spacing.xs }]}>{setupStatusLabel}</Text>
            </View>
            <View style={{ flexShrink: 0, marginLeft: spacing.sm }}>
              {setupGuideExpanded
                ? <ChevronUp accessible={false} color={colors.textSecondary} size={20} />
                : <ChevronDown accessible={false} color={colors.textSecondary} size={20} />}
            </View>
          </AnimatedPressable>
          {setupGuideExpanded && (
            <View style={{ padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <Text style={[typography.titleSmall, { color: colors.textPrimary }]}>Push-ups dismiss the alarm</Text>
              <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                Anthra checks your movement on-device while the alarm rings. Camera frames are never saved or uploaded.
              </Text>

              {permissionStatus && setupNeedsAttention && (
                <View style={{ marginTop: spacing.lg }}>
                  <StatusBanner
                    title="Alarm setup needs attention"
                    message={!permissionStatus.nativeSupported
                      ? "Install an Android development build; Expo Go cannot run exact alarms or pose tracking."
                      : "Complete the permissions below before relying on an alarm."}
                    variant="danger"
                  />
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {(!cameraGranted || !notificationsGranted) && (
                      <Button
                        label="Allow camera and notifications"
                        variant="outline"
                        fullWidth
                        onPress={() => requestRuntimePermissions().catch(() => undefined)}
                      />
                    )}
                    {!permissionStatus.exactAlarm && permissionStatus.nativeSupported && (
                      <Button
                        label="Allow exact alarms"
                        variant="outline"
                        fullWidth
                        onPress={() => openExactAlarmSettings().catch(() => undefined)}
                      />
                    )}
                    {!permissionStatus.fullScreenIntent && permissionStatus.nativeSupported && (
                      <Button
                        label="Allow full-screen alarms"
                        variant="outline"
                        fullWidth
                        onPress={() => openFullScreenIntentSettings().catch(() => undefined)}
                      />
                    )}
                  </View>
                </View>
              )}

              <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                <Text style={[typography.label, { color: colors.brand }]}>CAMERA PLACEMENT</Text>
                <Text style={[typography.body, { color: colors.textSecondary }]}>1. Turn the phone landscape and prop it securely beside you.</Text>
                <Text style={[typography.body, { color: colors.textSecondary }]}>2. Start 1–1.5 metres from your side and 30–60 cm above the floor.</Text>
                <Text style={[typography.body, { color: colors.textSecondary }]}>3. Keep your head, visible arm, hips, and camera-side knee in frame.</Text>
                <Text style={[typography.body, { color: colors.textSecondary }]}>4. Hold a straight-arm plank until the tracker says Ready.</Text>
              </View>

              <Button
                label="Test camera with 3 push-ups"
                icon={Camera}
                fullWidth
                onPress={() => handleTestTracker(3)}
                style={{ marginTop: spacing.lg }}
              />
            </View>
          )}
        </View>

        {notice && (
          <StatusBanner
            title={noticeNeedsAttention ? "Alarm needs attention" : "Alarm updated"}
            message={notice}
            variant={noticeNeedsAttention ? "danger" : "success"}
            style={{ marginTop: spacing.lg }}
          />
        )}

        <SectionHeader
          title="Your alarms"
          meta={`${alarms.length} total`}
          style={{ marginBottom: spacing.sm, marginTop: spacing.xl }}
        />

        {alarms.length === 0 && (
          <EmptyState
            icon={AlarmClock}
            title="No alarms yet"
            description="Create an alarm, test camera placement, and Anthra will handle the hard part."
            action={{ label: "Create alarm", icon: Plus, onPress: () => openEditor() }}
          />
        )}

        {alarms.map((alarm) => {
          const next = alarm.enabled ? nextAlarmTimestamp(alarm, currentTime) : null;
          return (
            <Card key={alarm.id} style={{ marginTop: spacing.md }}>
              <View className="flex-row items-start" style={{ gap: spacing.md }}>
                <View className="min-w-0 flex-1">
                  <Text style={[typography.headline, { color: colors.textPrimary }]}>{alarmTimeLabel(alarm.hour, alarm.minute)}</Text>
                  <Text style={[typography.bodyStrong, { color: colors.textPrimary, marginTop: spacing.xs }]}>{alarm.label}</Text>
                  <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                    {alarm.pushupTarget} push-ups · {formatDays(alarm.days)} · IST
                  </Text>
                  <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>{alarm.soundName}</Text>
                </View>
                <Switch
                  value={alarm.enabled}
                  onValueChange={() => handleToggle(alarm).catch(() => undefined)}
                  accessibilityRole="switch"
                  accessibilityLabel={`${alarm.label} alarm`}
                  accessibilityHint={alarm.enabled ? "Turns this alarm off" : "Turns this alarm on"}
                  trackColor={{ false: colors.borderStrong, true: colors.brandBorder }}
                  thumbColor={alarm.enabled ? colors.brandSolid : colors.textTertiary}
                  ios_backgroundColor={colors.borderStrong}
                />
              </View>

              {next && (
                <View
                  accessible
                  accessibilityLabel={`Rings in ${formatTimeRemaining(next, currentTime)}, ${formatIstTimestamp(next)}`}
                  style={{ padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.brandSoft, marginTop: spacing.lg }}
                >
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>RINGS IN</Text>
                  <Text style={[typography.titleMedium, { color: colors.brand, marginTop: spacing.xs }]}>{formatTimeRemaining(next, currentTime)}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>{formatIstTimestamp(next)}</Text>
                </View>
              )}

              <View className="flex-row items-center" style={{ gap: spacing.sm, marginTop: spacing.lg }}>
                <Button label="Edit" icon={Pencil} fullWidth onPress={() => openEditor(alarm)} style={{ flex: 1 }} />
                <IconButton icon={Trash2} variant="danger" accessibilityLabel={`Delete ${alarm.label}`} onPress={() => handleDelete(alarm)} />
              </View>
            </Card>
          );
        })}

        {history.length > 0 && (
          <View style={{ marginTop: spacing["2xl"] }}>
            <Text style={[typography.titleSmall, { color: colors.textPrimary, marginBottom: spacing.sm }]}>Recent results</Text>
            <Card padding="none" style={{ overflow: "hidden" }}>
              {history.slice(0, 8).map((entry, index) => (
                <View
                  key={entry.eventId}
                  className="flex-row items-center"
                  style={{
                    minHeight: 70,
                    gap: spacing.md,
                    padding: spacing.lg,
                    borderBottomWidth: index === Math.min(history.length, 8) - 1 ? 0 : 1,
                    borderBottomColor: colors.divider
                  }}
                >
                  <View className="min-w-0 flex-1">
                    <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{entry.label}</Text>
                    <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>{formatIstTimestamp(entry.completedAt)}</Text>
                  </View>
                  <Text style={[typography.label, { color: entry.status === "completed" ? colors.success : colors.brand, textAlign: "right" }]}>
                    {entry.status === "completed" ? `${entry.completedReps}/${entry.targetReps}` : "Emergency stop"}
                  </Text>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>

      <SheetDialog visible={editorOpen} title={form.id ? "Edit alarm" : "New alarm"} subtitle="Set the schedule and movement challenge." onClose={() => { if (!saving) { setEditorOpen(false); setEditorError(null); } }} backdropDismissEnabled={!saving} error={editorError} primaryAction={{ label: form.enabled ? "Save alarm" : "Save changes", onPress: () => handleSave().catch(() => undefined), loading: saving }} secondaryAction={{ label: "Cancel", onPress: () => { setEditorOpen(false); setEditorError(null); }, disabled: saving }}>
                {form.id && !form.enabled && (
                  <StatusBanner
                    title="This alarm is off"
                    message="Saving changes will keep it off. Turn it on from Your alarms when you are ready."
                    variant="info"
                    style={{ marginTop: spacing.sm }}
                  />
                )}

                <TextField
                  label="Label"
                  value={form.label}
                  onChangeText={(label) => {
                    setForm((current) => ({ ...current, label }));
                    if (editorError) setEditorError(null);
                  }}
                  maxLength={80}
                  placeholder="Wake up and move"
                  autoFocus
                  selectTextOnFocus={Boolean(form.id)}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => pushupTargetInputRef.current?.focus()}
                  containerStyle={{ marginTop: spacing.sm }}
                />

                <View style={{ marginTop: spacing.md }}>
                  <TimePickerField
                    label="Alarm time"
                    hour={form.hour}
                    minute={form.minute}
                    onChange={(hour, minute) => {
                      setForm((current) => ({ ...current, hour, minute }));
                      if (editorError) setEditorError(null);
                    }}
                    accentColor={colors.brand}
                    borderColor={colors.borderStrong}
                    backgroundColor={colors.surface}
                    textColor={colors.textPrimary}
                    mutedColor={colors.textSecondary}
                    presets={[
                      { label: "6 AM", hour: 6, minute: 0 },
                      { label: "7 AM", hour: 7, minute: 0 },
                      { label: "8 AM", hour: 8, minute: 0 }
                    ]}
                  />
                </View>

                <View style={{ marginTop: spacing.md }}>
                  <WeekdayPicker
                    label="Days"
                    value={form.days}
                    onChange={(days) => {
                      setForm((current) => ({ ...current, days }));
                      if (editorError) setEditorError(null);
                    }}
                    requireOne
                    variant="card"
                  />
                  <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>Choose at least one repeat day.</Text>
                </View>

                <TextField
                  ref={pushupTargetInputRef}
                  label="Push-ups required"
                  helperText="Complete this many push-ups to dismiss the alarm. Choose 1 to 100."
                  value={form.pushupTarget}
                  onChangeText={(pushupTarget) => {
                    setForm((current) => ({ ...current, pushupTarget: pushupTarget.replace(/[^0-9]/g, "") }));
                    if (editorError) setEditorError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  returnKeyType="done"
                  containerStyle={{ marginTop: spacing.md }}
                />
                <ChoiceRow
                  options={[
                    { label: "5", value: "5" },
                    { label: "10", value: "10" },
                    { label: "15", value: "15" },
                    { label: "20", value: "20" }
                  ]}
                  value={form.pushupTarget}
                  onChange={(pushupTarget) => {
                    setForm((current) => ({ ...current, pushupTarget }));
                    if (editorError) setEditorError(null);
                  }}
                  layout="equal"
                  variant="card"
                  style={{ marginTop: spacing.sm }}
                />

                <View style={{ marginTop: spacing.md }}>
                  <Text style={[typography.label, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Alarm sound</Text>
                  <AnimatedPressable
                    onPress={() => handlePickSound().catch(() => undefined)}
                    disabled={soundPicking}
                    accessibilityRole="button"
                    accessibilityLabel={`Alarm sound, ${form.soundName}`}
                    accessibilityHint="Opens sounds installed on this device"
                    accessibilityState={{ disabled: soundPicking, busy: soundPicking }}
                    className="flex-row items-center"
                    style={({ pressed }) => ({
                      minHeight: 64,
                      gap: spacing.md,
                      padding: spacing.md,
                      borderRadius: radii.lg,
                      borderWidth: 1,
                      borderColor: colors.borderStrong,
                      backgroundColor: pressed ? colors.surfacePressed : colors.surfaceSubtle,
                      opacity: soundPicking ? anthraTheme.motion.disabledOpacity : 1
                    })}
                  >
                    <View className="items-center justify-center" style={{ width: 40, height: 40, borderRadius: radii.full, backgroundColor: colors.brandSoft }}>
                      <Music2 accessible={false} color={colors.brand} size={21} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text style={[typography.bodyStrong, { color: colors.textPrimary }]}>{form.soundName}</Text>
                      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>{soundPicking ? "Opening device sounds…" : "Tap to choose a device alarm sound"}</Text>
                    </View>
                  </AnimatedPressable>
                </View>
      </SheetDialog>
    </ScreenLayout>
  );
}
