import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, Clock3, History as HistoryIcon, Trash2 } from "lucide-react-native";

import { ReminderTabBar, type ReminderTab } from "../../components/ReminderTabBar";
import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import {
  Button,
  Card,
  IconButton,
  KeyboardAwareScrollView,
  ScreenHeader,
  StatusBanner,
  SwitchRow,
  TextField,
  TimePickerField
} from "../../components/ui";
import { WEEKDAY_OPTIONS, normalizeDays } from "../../constants/schedule";
import { useAnthraTheme } from "../../design-system";
import {
  deleteReminderItem,
  getReminderCompletionEntries,
  getReminderItems,
  markReminderOccurrenceDone,
  saveReminderItem,
  setReminderItemEnabled
} from "../../db";
import type {
  ReminderCompletionEntry,
  ReminderInput,
  ReminderItem,
  ReminderMode,
  ReminderTimeSlot
} from "../../types";
import { syncReminderBuddyNotifications } from "../../utils/reminderBuddy";
import {
  getNotificationHealth,
  sendTestNotification,
  type NotificationHealth
} from "../../utils/notificationHealth";
import { formatTimestampInTimeZone, getDeviceTimeZone } from "../../utils/timezone";
import { validateOneTimeReminder } from "../../utils/reminderValidation";
import {
  INITIAL_REMINDER_FORM,
  REMINDER_HISTORY_PAST_DAYS,
  buildReminderCalendarDays,
  buildReminderHistoryOccurrences,
  digitsOnly,
  ensureReminderTimeInputs,
  formatReminderCalendarMonth,
  formatReminderModeLabel,
  formatReminderOccurrenceLabel,
  formatReminderSchedule,
  formatTimeLabel,
  getDeviceTodayLabel,
  getReminderCalendarMonthFromDateLabel,
  parseReminderTimeSlotInput,
  parseStrictWholeNumber,
  shiftReminderCalendarMonth,
  withAlpha,
  type ReminderFormState,
  type ReminderHistoryItem
} from "./reminderHelpers";

export type ReminderBuddyScreenProps = {
  onBack: () => void;
  /** Optional tab when opened from notification */
  initialTab?: ReminderTab;
};

export function ReminderBuddyScreen({ onBack, initialTab }: ReminderBuddyScreenProps) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { colors, isDark } = theme;
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const shouldStackActions = windowWidth < 420 || fontScale >= 1.2;
  const reminderCalendarDaySize = Math.max(
    32,
    Math.min(40, Math.floor((Math.min(windowWidth, 640) - 104) / 7))
  );

  const [reminderItems, setReminderItems] = useState<ReminderItem[]>([]);
  const [reminderCompletions, setReminderCompletions] = useState<ReminderCompletionEntry[]>([]);
  const [reminderTrackerView, setReminderTrackerView] = useState<ReminderTab>(initialTab ?? "reminders");
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [reminderForm, setReminderForm] = useState<ReminderFormState>(INITIAL_REMINDER_FORM);
  const [reminderCalendarMonth, setReminderCalendarMonth] = useState(
    getReminderCalendarMonthFromDateLabel(getDeviceTodayLabel())
  );
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderEditorError, setReminderEditorError] = useState("");
  const [reminderNotice, setReminderNotice] = useState<{
    type: "success" | "error";
    message: string;
    title?: string;
  } | null>(null);
  const [reminderHeaderBottom, setReminderHeaderBottom] = useState(0);
  const [notificationHealth, setNotificationHealth] = useState<NotificationHealth | null>(null);
  const [notificationHealthLoading, setNotificationHealthLoading] = useState(false);
  const [notificationTestNotice, setNotificationTestNotice] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const keyboardBottomPadding = keyboardHeight > 0 ? keyboardHeight + 16 : 24;

  const refreshReminderItems = useCallback(async (): Promise<ReminderItem[]> => {
    const items = await getReminderItems();
    setReminderItems(items);
    return items;
  }, []);

  const refreshReminderCompletions = useCallback(async (): Promise<ReminderCompletionEntry[]> => {
    const entries = await getReminderCompletionEntries();
    setReminderCompletions(entries);
    return entries;
  }, []);

  const syncReminderBuddyState = useCallback(
    async (
      reminders: ReminderItem[] | null = null,
      completions: ReminderCompletionEntry[] | null = null
    ) => {
      const nextReminders = reminders ?? (await refreshReminderItems());
      const nextCompletions = completions ?? (await refreshReminderCompletions());
      return syncReminderBuddyNotifications(nextReminders, nextCompletions);
    },
    [refreshReminderCompletions, refreshReminderItems]
  );

  const refreshNotificationHealth = useCallback(async () => {
    setNotificationHealthLoading(true);
    try {
      setNotificationHealth(await getNotificationHealth());
    } finally {
      setNotificationHealthLoading(false);
    }
  }, []);

  const handleSendTestNotification = useCallback(async () => {
    setNotificationTestNotice(null);
    const result = await sendTestNotification();
    setNotificationTestNotice(result.message);
    await refreshNotificationHealth();
  }, [refreshNotificationHealth]);

  useEffect(() => {
    if (initialTab) setReminderTrackerView(initialTab);
  }, [initialTab]);

  useEffect(() => {
    refreshReminderItems().catch(() => undefined);
    refreshReminderCompletions().catch(() => undefined);
    refreshNotificationHealth().catch(() => undefined);
  }, [refreshNotificationHealth, refreshReminderCompletions, refreshReminderItems]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      Promise.all([refreshReminderItems(), refreshReminderCompletions()])
        .then(([items, completions]) => syncReminderBuddyState(items, completions))
        .then(() => refreshNotificationHealth())
        .catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshNotificationHealth, refreshReminderCompletions, refreshReminderItems, syncReminderBuddyState]);

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
    if (!reminderNotice) return;
    const timeout = setTimeout(() => setReminderNotice(null), 3200);
    return () => clearTimeout(timeout);
  }, [reminderNotice]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      if (reminderEditorOpen) {
        if (!reminderSaving) {
          setReminderEditorOpen(false);
          setReminderEditorError("");
        }
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [keyboardHeight, reminderEditorOpen, reminderSaving]);

  const openReminderEditor = (item?: ReminderItem) => {
    setReminderSaving(false);
    setReminderEditorError("");
    if (!item) {
      const todayLabel = getDeviceTodayLabel();
      setReminderForm({
        ...INITIAL_REMINDER_FORM,
        dateLabel: todayLabel
      });
      setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(todayLabel));
      setReminderEditorOpen(true);
      return;
    }

    const dateLabel = item.dateLabel ?? getDeviceTodayLabel();
    setReminderForm({
      id: item.id,
      title: item.title,
      mode: item.mode,
      hour: String(item.hour),
      minute: String(item.minute),
      dateLabel,
      note: item.note,
      days: [...item.days],
      timeSlots: ensureReminderTimeInputs(
        item.timeSlots.map((slot) => formatTimeLabel(slot.hour, slot.minute))
      ),
      intervalMinutes: item.intervalMinutes == null ? "60" : String(item.intervalMinutes),
      intervalStartHour: item.intervalStartHour == null ? "8" : String(item.intervalStartHour),
      intervalStartMinute: item.intervalStartMinute == null ? "0" : String(item.intervalStartMinute),
      intervalEndHour: item.intervalEndHour == null ? "22" : String(item.intervalEndHour),
      intervalEndMinute: item.intervalEndMinute == null ? "0" : String(item.intervalEndMinute),
      enabled: item.enabled
    });
    setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(dateLabel));
    setReminderEditorOpen(true);
  };

  const toggleReminderDay = (day: number) => {
    setReminderForm((prev) => {
      const nextDays = prev.days.includes(day)
        ? prev.days.filter((value) => value !== day)
        : normalizeDays([...prev.days, day]);
      return {
        ...prev,
        days: nextDays
      };
    });
  };

  const handleSaveReminder = async () => {
    if (reminderSaving) return;
    setReminderSaving(true);
    setReminderEditorError("");
    try {
      if (!reminderForm.title.trim()) {
        setReminderEditorError("Reminder title is required.");
        return;
      }
      const payload: ReminderInput = {
        id: reminderForm.id,
        title: reminderForm.title.trim(),
        note: reminderForm.note.trim(),
        mode: reminderForm.mode,
        hour: 9,
        minute: 0,
        dateLabel: null,
        days: reminderForm.days,
        timeSlots: [],
        intervalMinutes: null,
        intervalStartHour: null,
        intervalStartMinute: null,
        intervalEndHour: null,
        intervalEndMinute: null,
        enabled: reminderForm.enabled,
        timezone: reminderForm.id
          ? reminderItems.find((item) => item.id === reminderForm.id)?.timezone ?? getDeviceTimeZone()
          : getDeviceTimeZone()
      };

      if (reminderForm.mode === "time" || reminderForm.mode === "once") {
        const hour = parseStrictWholeNumber(reminderForm.hour);
        const minute = parseStrictWholeNumber(reminderForm.minute);
        if (hour == null || hour < 0 || hour > 23 || minute == null || minute < 0 || minute > 59) {
          setReminderEditorError("Time must be valid (hour 0-23, minute 0-59).");
          return;
        }

        payload.hour = hour;
        payload.minute = minute;
        payload.dateLabel = reminderForm.mode === "once" ? reminderForm.dateLabel.trim() : null;

        if (reminderForm.mode === "once") {
          const validationError = validateOneTimeReminder({
            dateLabel: reminderForm.dateLabel,
            hour,
            minute,
            timeZone: payload.timezone
          });
          if (validationError) {
            setReminderEditorError(validationError);
            return;
          }
        }
      } else if (reminderForm.mode === "multi") {
        const enteredTimeSlots = reminderForm.timeSlots.filter((value) => value.trim().length > 0);
        const parsedTimeSlots = enteredTimeSlots.map((value) => parseReminderTimeSlotInput(value));
        if (parsedTimeSlots.some((value) => value == null)) {
          setReminderEditorError("Every time must use a valid HH:MM value.");
          return;
        }
        const timeSlots = parsedTimeSlots.filter((value): value is ReminderTimeSlot => value != null);
        if (timeSlots.length === 0) {
          setReminderEditorError("Add at least one time in HH:MM format.");
          return;
        }
        payload.timeSlots = timeSlots;
        payload.hour = timeSlots[0].hour;
        payload.minute = timeSlots[0].minute;
      } else {
        const intervalMinutes = parseStrictWholeNumber(reminderForm.intervalMinutes);
        const startHour = parseStrictWholeNumber(reminderForm.intervalStartHour);
        const startMinute = parseStrictWholeNumber(reminderForm.intervalStartMinute);
        const endHour = parseStrictWholeNumber(reminderForm.intervalEndHour);
        const endMinute = parseStrictWholeNumber(reminderForm.intervalEndMinute);

        if (intervalMinutes == null || intervalMinutes < 5 || intervalMinutes > 720) {
          setReminderEditorError("Interval must be between 5 and 720 minutes.");
          return;
        }
        if (
          startHour == null ||
          startHour < 0 ||
          startHour > 23 ||
          startMinute == null ||
          startMinute < 0 ||
          startMinute > 59 ||
          endHour == null ||
          endHour < 0 ||
          endHour > 23 ||
          endMinute == null ||
          endMinute < 0 ||
          endMinute > 59
        ) {
          setReminderEditorError("Interval start and end times must be valid.");
          return;
        }

        if (endHour * 60 + endMinute <= startHour * 60 + startMinute) {
          setReminderEditorError("Interval end time must be later than its start time.");
          return;
        }

        payload.intervalMinutes = intervalMinutes;
        payload.intervalStartHour = startHour;
        payload.intervalStartMinute = startMinute;
        payload.intervalEndHour = endHour;
        payload.intervalEndMinute = endMinute;
        payload.hour = startHour;
        payload.minute = startMinute;
      }

      await saveReminderItem(payload);
      const items = await refreshReminderItems();
      const sync = await syncReminderBuddyState(items, reminderCompletions);
      const todayLabel = getDeviceTodayLabel();
      setReminderEditorOpen(false);
      setReminderEditorError("");
      setReminderForm({
        ...INITIAL_REMINDER_FORM,
        dateLabel: todayLabel
      });
      setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(todayLabel));
      setReminderNotice({ type: "success", message: sync.message });
      await refreshNotificationHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save reminder.";
      setReminderEditorError(message);
    } finally {
      setReminderSaving(false);
    }
  };

  const handleDeleteReminder = (item: ReminderItem) => {
    Alert.alert("Delete reminder", `Delete "${item.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteReminderItem(item.id);
            const items = await refreshReminderItems();
            const completions = await refreshReminderCompletions();
            await syncReminderBuddyState(items, completions);
            await refreshNotificationHealth();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not delete reminder.";
            setReminderNotice({ type: "error", message });
          }
        }
      }
    ]);
  };

  const handleToggleReminder = async (item: ReminderItem) => {
    try {
      await setReminderItemEnabled(item.id, !item.enabled);
      const items = await refreshReminderItems();
      await syncReminderBuddyState(items, reminderCompletions);
      await refreshNotificationHealth();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update reminder.";
      setReminderNotice({ type: "error", message });
    }
  };

  const handleMarkReminderDone = async (item: ReminderHistoryItem) => {
    try {
      await markReminderOccurrenceDone(item.reminderId, item.occurrenceTs);
      const completions = await refreshReminderCompletions();
      const sync = await syncReminderBuddyState(reminderItems, completions);
      setReminderNotice({ type: "success", title: "Nice work!", message: sync.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not mark reminder as done.";
      setReminderNotice({ type: "error", message });
    }
  };

  const reminderHistoryItems = useMemo(() => {
    const nowMs = Date.now();
    const completionKeys = new Set(
      reminderCompletions.map((entry) => `${entry.reminderId}:${entry.occurrenceTs}`)
    );
    const items: ReminderHistoryItem[] = [];

    for (const reminder of reminderItems) {
      const occurrences = buildReminderHistoryOccurrences(
        reminder,
        nowMs,
        REMINDER_HISTORY_PAST_DAYS,
        0
      );

      for (const occurrenceTs of occurrences) {
        if (occurrenceTs < reminder.createdAt || occurrenceTs > nowMs) {
          continue;
        }
        items.push({
          reminderId: reminder.id,
          occurrenceTs,
          title: reminder.title,
          note: reminder.note,
          mode: reminder.mode,
          timezone: reminder.timezone || getDeviceTimeZone(),
          done: completionKeys.has(`${reminder.id}:${occurrenceTs}`)
        });
      }
    }

    items.sort((left, right) => right.occurrenceTs - left.occurrenceTs);
    return items;
  }, [reminderCompletions, reminderItems]);

  const pendingReminderHistory = useMemo(
    () =>
      reminderHistoryItems
        .filter((item) => !item.done && item.occurrenceTs <= Date.now())
        .sort((left, right) => right.occurrenceTs - left.occurrenceTs),
    [reminderHistoryItems]
  );

  const doneReminderHistory = useMemo(
    () =>
      reminderHistoryItems
        .filter((item) => item.done)
        .sort((left, right) => right.occurrenceTs - left.occurrenceTs),
    [reminderHistoryItems]
  );

  const reminderCalendarDays = useMemo(
    () => buildReminderCalendarDays(reminderCalendarMonth),
    [reminderCalendarMonth]
  );

  const enabledReminderCount = useMemo(
    () => reminderItems.filter((item) => item.enabled).length,
    [reminderItems]
  );

  return (
    <>
      <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
        <View
          className="border-b px-5"
          onLayout={(event) => setReminderHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          style={{ borderColor: colors.border }}
        >
          <ScreenHeader
            eyebrow="ORGANIZE"
            title="Reminders"
            subtitle={`${enabledReminderCount} active · ${deviceTimeZone}`}
            onBack={() => onBack()}
            backLabel="Back to Today"
            action={<Button label="New" size="small" onPress={() => openReminderEditor()} />}
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
            paddingTop: 20,
            paddingBottom: keyboardBottomPadding
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl border p-4" style={{ borderColor: colors.brandBorder, backgroundColor: colors.brandSoft }}>
            <Text className="text-base font-semibold" style={{ color: colors.textSecondary }}>
              Build one-time events, repeating reminders, multiple daily times, or interval nudges in your device timezone.
            </Text>
          </View>

          <View className="mt-4 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}>
            <View className="flex-row items-start" style={{ gap: theme.spacing.md }}>
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: colors.brand }}>
                  Notifications
                </Text>
                <Text className="mt-1 text-base font-bold" style={{ color: colors.textPrimary }}>
                  {notificationHealthLoading
                    ? "Checking device status…"
                    : notificationHealth?.permission === "granted"
                      ? `${notificationHealth.reminderCount} scheduled`
                      : `Permission: ${notificationHealth?.permission ?? "unknown"}`}
                </Text>
              </View>
              {notificationHealthLoading && <ActivityIndicator size="small" color={colors.brand} />}
            </View>
            <Text className="mt-3 text-sm font-semibold" style={{ color: colors.textSecondary }}>
              {notificationHealth?.nextReminderTriggerAt
                ? `Next: ${formatTimestampInTimeZone(notificationHealth.nextReminderTriggerAt, deviceTimeZone)}`
                : notificationHealth?.supported === false
                  ? "Use a development build to test native notifications."
                  : "No upcoming reminder notification detected."}
            </Text>
            <View
              className="mt-4"
              style={{ flexDirection: shouldStackActions ? "column" : "row", gap: theme.spacing.sm }}
            >
              <Button
                label="Send test"
                onPress={() => handleSendTestNotification().catch(() => undefined)}
                variant="secondary"
                size="small"
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
              <Button
                label="System settings"
                onPress={() => Linking.openSettings().catch(() => undefined)}
                variant="outline"
                size="small"
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
            </View>
            {notificationTestNotice && (
              <Text className="mt-3 text-sm font-semibold" style={{ color: colors.brand }}>
                {notificationTestNotice}
              </Text>
            )}
          </View>
          {reminderTrackerView === "reminders" && (
            <>
              {reminderItems.length === 0 && (
                <View className="mt-4 rounded-2xl border border-dashed p-5" style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}>
                  <Text className="text-base" style={{ color: colors.textSecondary }}>No reminders yet.</Text>
                </View>
              )}
              {reminderItems.map((item) => (
                <View key={item.id} className="mt-4 rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-xl font-bold" style={{ color: colors.textPrimary }}>{item.title}</Text>
                      <Text className="mt-1 text-xs font-black uppercase tracking-[1.2px]" style={{ color: colors.brand }}>
                        {formatReminderModeLabel(item.mode)}
                      </Text>
                      <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px]" style={{ color: colors.textSecondary }}>
                        {formatReminderSchedule(item)}
                      </Text>
                      {item.note.trim().length > 0 && <Text className="mt-2 text-base" style={{ color: colors.textSecondary }}>{item.note}</Text>}
                    </View>
                    <View className="items-end" style={{ gap: theme.spacing.xs }}>
                      <Pressable
                        onPress={() => handleToggleReminder(item).catch(() => undefined)}
                        accessibilityRole="switch"
                        accessibilityLabel={`${item.title} reminder`}
                        accessibilityState={{ checked: item.enabled }}
                        className="min-h-[44px] items-center justify-center rounded-full px-3 py-2"
                        style={{ backgroundColor: item.enabled ? withAlpha(colors.brand, 0.22) : withAlpha(colors.textPrimary, 0.1) }}
                      >
                        <Text className="text-xs font-black uppercase" style={{ color: item.enabled ? colors.brand : colors.textSecondary }}>
                          {item.enabled ? "On" : "Off"}
                        </Text>
                      </Pressable>
                      <IconButton
                        icon={Trash2}
                        onPress={() => handleDeleteReminder(item)}
                        accessibilityLabel={`Delete ${item.title}`}
                        variant="danger"
                        size="small"
                      />
                    </View>
                  </View>
                  <Button
                    label="Edit reminder"
                    onPress={() => openReminderEditor(item)}
                    variant="outline"
                    fullWidth
                    style={{ marginTop: theme.spacing.md }}
                  />
                </View>
              ))}
            </>
          )}

          {reminderTrackerView === "history" && (
            <>
              {pendingReminderHistory.length === 0 &&
                doneReminderHistory.length === 0 && (
                  <Card variant="subtle" padding="large" style={{ alignItems: "center", marginTop: theme.spacing["2xl"] }}>
                    <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: theme.colors.brandSoft }}>
                      <HistoryIcon accessible={false} color={theme.colors.brand} size={24} />
                    </View>
                    <Text style={[theme.typography.titleSmall, { color: colors.textPrimary, textAlign: "center", marginTop: theme.spacing.lg }]}>No reminder activity yet</Text>
                    <Text style={[theme.typography.body, { color: colors.textSecondary, textAlign: "center", marginTop: theme.spacing.xs }]}>Completed and pending reminder occurrences will appear here.</Text>
                  </Card>
                )}

              {pendingReminderHistory.length > 0 && (
                <View style={{ marginTop: theme.spacing["2xl"] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                      <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: theme.colors.warningSoft }}>
                        <Clock3 accessible={false} color={theme.colors.warning} size={18} />
                      </View>
                      <Text style={[theme.typography.titleSmall, { color: colors.textPrimary }]}>Pending</Text>
                    </View>
                    <View style={{ minWidth: 28, height: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing.sm, borderRadius: theme.radii.full, backgroundColor: theme.colors.warningSoft }}>
                      <Text style={[theme.typography.label, { color: theme.colors.warning }]}>{pendingReminderHistory.length}</Text>
                    </View>
                  </View>
                  <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
                    {pendingReminderHistory.map((item) => (
                      <Card key={`pending-${item.reminderId}-${item.occurrenceTs}`} padding="large">
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.md, backgroundColor: theme.colors.warningSoft }}>
                            <Clock3 accessible={false} color={theme.colors.warning} size={20} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} style={[theme.typography.titleSmall, { color: colors.textPrimary, textAlign: "left" }]}>{item.title}</Text>
                            <Text style={[theme.typography.caption, { color: theme.colors.warning, marginTop: theme.spacing.xs }]}>{formatReminderOccurrenceLabel(item.occurrenceTs, item.timezone)}</Text>
                          </View>
                          <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.full, backgroundColor: theme.colors.warningSoft }}>
                            <Text style={[theme.typography.caption, { color: theme.colors.warning }]}>PENDING</Text>
                          </View>
                        </View>
                        {item.note.trim().length > 0 && (
                          <View style={{ marginTop: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSubtle }}>
                            <Text style={[theme.typography.body, { color: colors.textSecondary }]}>{item.note}</Text>
                          </View>
                        )}
                        <Button
                          label="Mark as done"
                          icon={CheckCircle2}
                          onPress={() => handleMarkReminderDone(item).catch(() => undefined)}
                          accessibilityLabel={`Mark ${item.title} done`}
                          fullWidth
                          style={{ marginTop: theme.spacing.lg }}
                        />
                      </Card>
                    ))}
                  </View>
                </View>
              )}

              {doneReminderHistory.length > 0 && (
                <View style={{ marginTop: theme.spacing["2xl"] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
                      <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: theme.colors.successSoft }}>
                        <CheckCircle2 accessible={false} color={theme.colors.success} size={18} />
                      </View>
                      <Text style={[theme.typography.titleSmall, { color: colors.textPrimary }]}>Completed</Text>
                    </View>
                    <View style={{ minWidth: 28, height: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.spacing.sm, borderRadius: theme.radii.full, backgroundColor: theme.colors.successSoft }}>
                      <Text style={[theme.typography.label, { color: theme.colors.success }]}>{doneReminderHistory.length}</Text>
                    </View>
                  </View>
                  <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
                    {doneReminderHistory.map((item) => (
                      <Card key={`done-${item.reminderId}-${item.occurrenceTs}`} padding="large">
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.md, backgroundColor: theme.colors.successSoft }}>
                            <CheckCircle2 accessible={false} color={theme.colors.success} size={20} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} style={[theme.typography.titleSmall, { color: colors.textPrimary, textAlign: "left" }]}>{item.title}</Text>
                            <Text style={[theme.typography.caption, { color: theme.colors.success, marginTop: theme.spacing.xs }]}>{formatReminderOccurrenceLabel(item.occurrenceTs, item.timezone)}</Text>
                          </View>
                          <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.full, backgroundColor: theme.colors.successSoft }}>
                            <Text style={[theme.typography.caption, { color: theme.colors.success }]}>DONE</Text>
                          </View>
                        </View>
                        {item.note.trim().length > 0 && (
                          <View style={{ marginTop: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSubtle }}>
                            <Text style={[theme.typography.body, { color: colors.textSecondary }]}>{item.note}</Text>
                          </View>
                        )}
                      </Card>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

        </ScrollView>
        <ReminderTabBar activeTab={reminderTrackerView} onChange={setReminderTrackerView} />
        {reminderNotice && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: theme.layout.screenPadding,
              right: theme.layout.screenPadding,
              top: reminderHeaderBottom + theme.spacing.md,
              zIndex: 20
            }}
          >
            <StatusBanner
              title={reminderNotice.title ?? (reminderNotice.type === "success" ? "Reminder updated" : "Reminder needs attention")}
              message={reminderNotice.message}
              variant={reminderNotice.type === "success" ? "success" : "danger"}
              style={{
                width: "100%",
                maxWidth: 520,
                alignSelf: "center",
                shadowColor: isDark ? "#000000" : reminderNotice.type === "success" ? "#173D2B" : "#5D1B16",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.34 : 0.18,
                shadowRadius: 18,
                elevation: 10
              }}
            />
          </View>
        )}
      </ScreenLayout>
      <Modal
        visible={reminderEditorOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReminderEditorOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          style={{ backgroundColor: theme.colors.scrim }}
        >
          <SafeAreaView
            edges={["bottom"]}
            style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 16 }}
          >
          <View
            accessibilityViewIsModal
            className="w-full rounded-3xl border p-5"
            style={{ borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              maxWidth: 640,
              maxHeight: "92%",
              alignSelf: "center"
            }}
          >
            <Text accessibilityRole="header" className="text-2xl font-black" style={{ color: colors.textPrimary }}>
              {reminderForm.id ? "Edit Reminder" : "New Reminder"}
            </Text>
            {reminderEditorError.length > 0 && (
              <StatusBanner
                className="mt-3"
                title="Check this reminder"
                message={reminderEditorError}
                variant="danger"
              />
            )}
            <KeyboardAwareScrollView
              className="mt-2"
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <TextField
                label="Title"
                value={reminderForm.title}
                onChangeText={(value) => setReminderForm((prev) => ({ ...prev, title: value }))}
                placeholder="What should Anthra remind you about?"
                autoFocus
                selectTextOnFocus={Boolean(reminderForm.id)}
                returnKeyType="done"
                required
                containerStyle={{ marginTop: 8 }}
              />
              <Text className="mb-2 mt-3 text-sm font-semibold" style={{ color: colors.textSecondary }}>Reminder Type</Text>
              <View className="flex-row flex-wrap" style={{ gap: theme.spacing.sm }}>
                {([
                  { value: "time", label: "Recurring" },
                  { value: "multi", label: "Multiple Times" },
                  { value: "interval", label: "Interval" },
                  { value: "once", label: "One Time" }
                ] as { value: ReminderMode; label: string }[]).map((option) => {
                  const selected = reminderForm.mode === option.value;
                  return (
                    <Pressable
                      key={`reminder-mode-${option.value}`}
                      onPress={() => {
                        const nextDateLabel = reminderForm.dateLabel || getDeviceTodayLabel();
                        setReminderForm((prev) => ({
                          ...prev,
                          mode: option.value,
                          dateLabel: prev.dateLabel || nextDateLabel
                        }));
                        if (option.value === "once") {
                          setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(nextDateLabel));
                        }
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={option.label}
                      accessibilityState={{ checked: selected, selected }}
                      className="min-h-[48px] items-center justify-center rounded-xl border px-3 py-2"
                      style={{
                        flexBasis: "47%",
                        flexGrow: 1,
                        borderColor: selected ? colors.brand : colors.brandBorder,
                        backgroundColor: selected ? withAlpha(colors.brand, 0.18) : colors.surfaceSubtle
                      }}
                    >
                      <Text className="text-center text-xs font-black uppercase" style={{ color: selected ? colors.brand : colors.textSecondary }}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                {reminderForm.mode === "interval"
                  ? "Best for things like drink water every hour."
                  : reminderForm.mode === "multi"
                    ? "Best for medicine or tasks that happen at several fixed times."
                    : reminderForm.mode === "once"
                      ? "Best for one-off events like a match or appointment."
                      : "Best for a repeating reminder at one fixed time."}
              </Text>

              {(reminderForm.mode === "time" || reminderForm.mode === "once") && (
                <>
                  <View className="mt-3">
                    <TimePickerField
                      label="Reminder time"
                      hour={parseStrictWholeNumber(reminderForm.hour) ?? 9}
                      minute={parseStrictWholeNumber(reminderForm.minute) ?? 0}
                      onChange={(hour, minute) =>
                        setReminderForm((current) => ({
                          ...current,
                          hour: String(hour),
                          minute: String(minute)
                        }))
                      }
                      accentColor={colors.brand}
                      borderColor={colors.brandBorder}
                      backgroundColor={colors.surfaceSubtle}
                      textColor={colors.textPrimary}
                      mutedColor={colors.textSecondary}
                      presets={[
                        { label: "Morning", hour: 8, minute: 0 },
                        { label: "Afternoon", hour: 13, minute: 0 },
                        { label: "Evening", hour: 18, minute: 0 }
                      ]}
                    />
                  </View>
                  {reminderForm.mode === "once" && (
                    <View className="mt-3">
                      <Text className="mb-2 text-sm font-semibold" style={{ color: colors.textSecondary }}>Date</Text>
                      <View
                        className="rounded-2xl border p-3"
                        style={{ borderColor: colors.brandBorder, backgroundColor: colors.surfaceSubtle }}
                      >
                        <View className="flex-row items-center justify-between">
                          <Pressable
                            onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, -1))}
                            accessibilityRole="button"
                            accessibilityLabel="Previous month"
                            className="min-h-[44px] justify-center rounded-xl border px-3 py-2"
                            style={{ borderColor: colors.brandBorder, backgroundColor: colors.surface }}
                          >
                            <Text className="text-xs font-black uppercase" style={{ color: colors.textSecondary }}>Prev</Text>
                          </Pressable>
                          <Text className="text-base font-black" style={{ color: colors.textPrimary }}>
                            {formatReminderCalendarMonth(reminderCalendarMonth)}
                          </Text>
                          <Pressable
                            onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, 1))}
                            accessibilityRole="button"
                            accessibilityLabel="Next month"
                            className="min-h-[44px] justify-center rounded-xl border px-3 py-2"
                            style={{ borderColor: colors.brandBorder, backgroundColor: colors.surface }}
                          >
                            <Text className="text-xs font-black uppercase" style={{ color: colors.textSecondary }}>Next</Text>
                          </Pressable>
                        </View>
                        <View className="mt-3 flex-row">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <View key={`calendar-head-${day.value}`} className="flex-1 items-center">
                              <Text className="text-xs font-black uppercase" style={{ color: colors.textSecondary }}>
                                {day.short}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <View className="mt-2 flex-row flex-wrap">
                          {reminderCalendarDays.map((day) => {
                            const selected = reminderForm.dateLabel === day.dateLabel;
                            const disabled = day.isPast;
                            return (
                              <Pressable
                                key={`calendar-day-${day.dateLabel}`}
                                onPress={() => {
                                  if (disabled) return;
                                  setReminderForm((prev) => ({ ...prev, dateLabel: day.dateLabel }));
                                }}
                                className="mb-2 w-[14.2857%] items-center"
                                disabled={disabled}
                                accessibilityRole="button"
                                accessibilityLabel={day.dateLabel}
                                accessibilityState={{ disabled, selected }}
                              >
                                <View
                                  className="items-center justify-center rounded-full border"
                                  style={{
                                    width: reminderCalendarDaySize,
                                    height: reminderCalendarDaySize,
                                    borderColor: selected
                                      ? colors.brand
                                      : day.isToday
                                        ? withAlpha(colors.brand, 0.65)
                                        : "transparent",
                                    backgroundColor: selected
                                      ? colors.brand
                                      : day.inMonth
                                        ? colors.surface
                                        : "transparent",
                                    opacity: disabled ? 0.35 : day.inMonth ? 1 : 0.6
                                  }}
                                >
                                  <Text
                                    className="text-sm font-semibold"
                                    style={{
                                      color: selected
                                        ? colors.textOnBrandSolid
                                        : day.inMonth
                                          ? colors.textPrimary
                                          : colors.textSecondary
                                    }}
                                  >
                                    {day.day}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                      <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                        Selected: {reminderForm.dateLabel || getDeviceTodayLabel()} in {getDeviceTimeZone()}.
                      </Text>
                    </View>
                  )}
                </>
              )}

              {reminderForm.mode === "multi" && (
                <View className="mt-3">
                  <Text className="mb-2 text-sm font-semibold" style={{ color: colors.textSecondary }}>Times</Text>
                  <View className="gap-3">
                    {reminderForm.timeSlots.map((slot, index) => {
                      if (!slot.trim()) return null;
                      const parsed = parseReminderTimeSlotInput(slot) ?? { hour: 8, minute: 0 };
                      return (
                        <View key={`slot-${index}`} className="rounded-2xl border p-3" style={{ borderColor: colors.brandBorder, backgroundColor: colors.surfaceSubtle }}>
                          <TimePickerField
                            label={`Time ${index + 1}`}
                            hour={parsed.hour}
                            minute={parsed.minute}
                            onChange={(hour, minute) =>
                              setReminderForm((prev) => {
                                const nextSlots = [...prev.timeSlots];
                                nextSlots[index] = formatTimeLabel(hour, minute);
                                return { ...prev, timeSlots: ensureReminderTimeInputs(nextSlots) };
                              })
                            }
                            accentColor={colors.brand}
                            borderColor={colors.brandBorder}
                            backgroundColor={colors.surface}
                            textColor={colors.textPrimary}
                            mutedColor={colors.textSecondary}
                          />
                          {reminderForm.timeSlots.filter((value) => value.trim()).length > 1 && (
                            <Pressable
                              onPress={() =>
                                setReminderForm((prev) => {
                                  const compacted = prev.timeSlots.filter((_, slotIndex) => slotIndex !== index && prev.timeSlots[slotIndex].trim());
                                  return { ...prev, timeSlots: ensureReminderTimeInputs(compacted) };
                                })
                              }
                              accessibilityRole="button"
                              accessibilityLabel={`Remove time ${index + 1}`}
                              className="mt-2 min-h-[44px] items-center justify-center rounded-xl border"
                              style={{ borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }}
                            >
                              <Text className="text-sm font-black uppercase" style={{ color: theme.colors.danger }}>Remove</Text>
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                  {reminderForm.timeSlots.filter((value) => value.trim()).length < 4 && (
                    <Pressable
                      onPress={() =>
                        setReminderForm((prev) => {
                          const compacted = prev.timeSlots.filter((value) => value.trim());
                          const last = parseReminderTimeSlotInput(compacted[compacted.length - 1] ?? "08:00") ?? { hour: 8, minute: 0 };
                          const nextHour = (last.hour + 4) % 24;
                          return { ...prev, timeSlots: ensureReminderTimeInputs([...compacted, formatTimeLabel(nextHour, last.minute)]) };
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel="Add another reminder time"
                      className="mt-3 min-h-[48px] items-center justify-center rounded-xl border"
                      style={{ borderColor: colors.brandBorder, backgroundColor: colors.surfaceSubtle }}
                    >
                      <Text className="text-sm font-black uppercase" style={{ color: colors.brand }}>Add another time</Text>
                    </Pressable>
                  )}
                  <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                    Add up to 4 daily times. Anthra handles the time format for you.
                  </Text>
                </View>
              )}

              {reminderForm.mode === "interval" && (
                <>
                  <View className="mt-3">
                    <TextField
                      label="Repeat every"
                      value={reminderForm.intervalMinutes}
                      onChangeText={(value) => setReminderForm((prev) => ({ ...prev, intervalMinutes: digitsOnly(value) }))}
                      keyboardType="number-pad"
                      placeholder="60 minutes"
                      helperText="Choose an interval from 1 to 720 minutes."
                      maxLength={3}
                    />
                  </View>
                  <View className="mt-3">
                    <TimePickerField
                      label="Start time"
                      hour={parseStrictWholeNumber(reminderForm.intervalStartHour) ?? 8}
                      minute={parseStrictWholeNumber(reminderForm.intervalStartMinute) ?? 0}
                      onChange={(hour, minute) =>
                        setReminderForm((current) => ({
                          ...current,
                          intervalStartHour: String(hour),
                          intervalStartMinute: String(minute)
                        }))
                      }
                      accentColor={colors.brand}
                      borderColor={colors.brandBorder}
                      backgroundColor={colors.surfaceSubtle}
                      textColor={colors.textPrimary}
                      mutedColor={colors.textSecondary}
                    />
                  </View>
                  <View className="mt-3">
                    <TimePickerField
                      label="End time"
                      hour={parseStrictWholeNumber(reminderForm.intervalEndHour) ?? 22}
                      minute={parseStrictWholeNumber(reminderForm.intervalEndMinute) ?? 0}
                      onChange={(hour, minute) =>
                        setReminderForm((current) => ({
                          ...current,
                          intervalEndHour: String(hour),
                          intervalEndMinute: String(minute)
                        }))
                      }
                      accentColor={colors.brand}
                      borderColor={colors.brandBorder}
                      backgroundColor={colors.surfaceSubtle}
                      textColor={colors.textPrimary}
                      mutedColor={colors.textSecondary}
                    />
                  </View>
                </>
              )}
              <TextField
                label="Note"
                value={reminderForm.note}
                onChangeText={(value) => setReminderForm((prev) => ({ ...prev, note: value }))}
                multiline
                placeholder="Add helpful context (optional)"
                containerStyle={{ marginTop: 12 }}
              />
              {reminderForm.mode !== "once" && (
                <>
                  <Text className="mb-2 mt-3 text-sm font-semibold" style={{ color: colors.textSecondary }}>Days</Text>
                  <View className="flex-row flex-wrap" style={{ gap: theme.spacing.sm }}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const selected = reminderForm.days.includes(day.value);
                      return (
                        <Pressable
                          key={`rday-${day.value}`}
                          onPress={() => toggleReminderDay(day.value)}
                          accessibilityRole="checkbox"
                          accessibilityLabel={day.label}
                          accessibilityState={{ checked: selected }}
                          className="min-h-[48px] items-center justify-center rounded-xl border px-2 py-2"
                          style={{
                            width: windowWidth < 520 || fontScale >= 1.2 ? "22%" : "12%",
                            borderColor: selected ? colors.brand : colors.brandBorder,
                            backgroundColor: selected ? withAlpha(colors.brand, 0.2) : colors.surfaceSubtle
                          }}
                        >
                          <Text className="text-xs font-bold uppercase" style={{ color: selected ? colors.brand : colors.textSecondary }}>
                            {day.short}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text className="mt-2 text-xs" style={{ color: colors.textSecondary }}>
                    Leave all days off to repeat every day.
                  </Text>
                </>
              )}
              <SwitchRow
                label="Reminder enabled"
                description={reminderForm.enabled
                  ? "This reminder will be scheduled after you save."
                  : "Save it without scheduling notifications yet."}
                value={reminderForm.enabled}
                onValueChange={(enabled) => setReminderForm((prev) => ({ ...prev, enabled }))}
                style={{ marginTop: theme.spacing.lg }}
              />
            </KeyboardAwareScrollView>
            <View
              className="mt-5"
              style={{ flexDirection: shouldStackActions ? "column" : "row", gap: theme.spacing.md }}
            >
              <Button
                label="Cancel"
                onPress={() => {
                  setReminderEditorOpen(false);
                  setReminderEditorError("");
                }}
                variant="outline"
                fullWidth
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
              <Button
                label="Save reminder"
                onPress={() => handleSaveReminder().catch(() => undefined)}
                loading={reminderSaving}
                fullWidth
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
            </View>
          </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
