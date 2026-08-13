import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import {
  BellRing,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History as HistoryIcon,
  Search,
  Trash2,
  X
} from "lucide-react-native";

import { ReminderTabBar, type ReminderTab } from "../../components/ReminderTabBar";
import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import {
  AnimatedPressable,
  Button,
  Card,
  ChoiceRow,
  DisclosureCard,
  EmptyState,
  IconButton,
  ScreenHeader,
  SectionHeader,
  StatusBanner,
  SwitchRow,
  TextField,
  TimePickerField,
  WeekdayPicker
} from "../../components/ui";
import { WEEKDAY_OPTIONS } from "../../constants/schedule";
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
import { ReminderEditorSheet } from "./ReminderEditorSheet";
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
  const shouldStackActions = windowWidth < 360 || fontScale >= 1.35;
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
  const [notificationPanelExpanded, setNotificationPanelExpanded] = useState(false);
  const [reminderSearchText, setReminderSearchText] = useState("");
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
    if (
      notificationHealth &&
      (!notificationHealth.supported || notificationHealth.permission !== "granted")
    ) {
      setNotificationPanelExpanded(true);
    }
  }, [notificationHealth]);

  const handleScreenBack = useCallback(() => {
    if (reminderTrackerView === "history") {
      setReminderTrackerView("reminders");
      return;
    }
    onBack();
  }, [onBack, reminderTrackerView]);

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
      if (reminderTrackerView === "history") {
        setReminderTrackerView("reminders");
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [keyboardHeight, reminderEditorOpen, reminderSaving, reminderTrackerView]);

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
  const filteredReminderItems = useMemo(() => {
    const query = reminderSearchText.trim().toLocaleLowerCase();
    if (!query) return reminderItems;
    return reminderItems.filter((item) =>
      [
        item.title,
        item.note,
        formatReminderModeLabel(item.mode),
        formatReminderSchedule(item)
      ].some((value) => value.toLocaleLowerCase().includes(query))
    );
  }, [reminderItems, reminderSearchText]);
  const notificationNeedsAttention = Boolean(
    notificationHealth &&
    (!notificationHealth.supported || notificationHealth.permission !== "granted")
  );
  const notificationStatusLabel = notificationHealthLoading
    ? "Checking…"
    : notificationNeedsAttention
      ? "Needs attention"
      : notificationHealth?.permission === "granted"
        ? "Working"
        : "Not checked";
  const notificationStatusColor = notificationNeedsAttention
    ? theme.colors.warning
    : notificationHealth?.permission === "granted"
      ? theme.colors.success
      : colors.textSecondary;
  const notificationStatusBackground = notificationNeedsAttention
    ? theme.colors.warningSoft
    : notificationHealth?.permission === "granted"
      ? theme.colors.successSoft
      : colors.surfaceSubtle;

  return (
    <>
      <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "left", "right"]}>
        <View
          className="border-b px-5"
          onLayout={(event) => setReminderHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          style={{ borderColor: colors.border }}
        >
          <ScreenHeader
            eyebrow="ORGANIZE"
            title="Reminders"
            subtitle={`${enabledReminderCount} active · ${deviceTimeZone}`}
            onBack={handleScreenBack}
            backLabel={reminderTrackerView === "history" ? "Back to Reminders" : "Back to Today"}
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
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.xl,
            paddingBottom: keyboardBottomPadding
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Card variant="brand">
            <Text style={[theme.typography.bodyStrong, { color: colors.textSecondary }]}>
              Build one-time events, repeating reminders, multiple daily times, or interval nudges in your device timezone.
            </Text>
          </Card>

          {reminderTrackerView === "reminders" && (
            <DisclosureCard title="Notification status" summary={notificationHealthLoading ? "Checking device status…" : notificationStatusLabel} expanded={notificationPanelExpanded} onExpandedChange={setNotificationPanelExpanded} style={{ marginTop: theme.spacing.lg }}>
                  <Text className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                    {notificationHealthLoading
                      ? "Checking device status…"
                      : notificationHealth?.permission === "granted"
                        ? `${notificationHealth.reminderCount} scheduled`
                        : `Permission: ${notificationHealth?.permission ?? "unknown"}`}
                  </Text>
                  <Text className="mt-2 text-sm font-semibold" style={{ color: colors.textSecondary }}>
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
            </DisclosureCard>
          )}
          {reminderTrackerView === "reminders" && (
            <>
              <TextField
                label="Search reminders"
                value={reminderSearchText}
                onChangeText={setReminderSearchText}
                placeholder="Search by title, note, or schedule"
                leadingIcon={Search}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Search reminders by title, note, or schedule"
                containerStyle={{ marginTop: theme.spacing.lg }}
                trailing={reminderSearchText.length > 0 ? (
                  <IconButton
                    icon={X}
                    size="small"
                    variant="ghost"
                    accessibilityLabel="Clear reminder search"
                    onPress={() => setReminderSearchText("")}
                  />
                ) : undefined}
              />
              {reminderItems.length === 0 && <EmptyState icon={BellRing} title="No reminders yet" description="Create a one-time or repeating reminder when you’re ready." style={{ marginTop: theme.spacing.lg }} />}
              {reminderItems.length > 0 && filteredReminderItems.length === 0 && (
                <EmptyState
                  icon={Search}
                  title="No reminders found"
                  description="Try a different title, note, or schedule."
                  action={{ label: "Clear search", onPress: () => setReminderSearchText("") }}
                  variant="inline"
                  style={{ marginTop: theme.spacing.lg }}
                />
              )}
              {filteredReminderItems.map((item) => (
                <Card key={item.id} style={{ marginTop: theme.spacing.md }}>
                  <View className="flex-row items-start justify-between">
                    <View className="min-w-0 flex-1 pr-3" style={{ minWidth: 0 }}>
                      <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleMedium, { color: colors.textPrimary }]}>{item.title}</Text>
                      <Text numberOfLines={1} style={[theme.typography.eyebrow, { color: colors.brand, marginTop: theme.spacing.xs }]}>
                        {formatReminderModeLabel(item.mode)}
                      </Text>
                      <Text numberOfLines={2} style={[theme.typography.label, { color: colors.textSecondary, marginTop: theme.spacing.xs }]}>
                        {formatReminderSchedule(item)}
                      </Text>
                      {item.note.trim().length > 0 && (
                        <Text numberOfLines={3} style={[theme.typography.body, { color: colors.textSecondary, marginTop: theme.spacing.sm }]}>
                          {item.note}
                        </Text>
                      )}
                    </View>
                    <View className="items-end" style={{ flexShrink: 0, gap: theme.spacing.xs }}>
                      <IconButton
                        icon={Trash2}
                        onPress={() => handleDeleteReminder(item)}
                        accessibilityLabel={`Delete ${item.title}`}
                        variant="danger"
                        size="small"
                      />
                    </View>
                  </View>
                  <SwitchRow
                    label="Reminder enabled"
                    description={item.enabled ? "Notifications are scheduled." : "This reminder is paused."}
                    value={item.enabled}
                    onValueChange={() => handleToggleReminder(item).catch(() => undefined)}
                    style={{ marginTop: theme.spacing.md }}
                  />
                  <Button
                    label="Edit reminder"
                    onPress={() => openReminderEditor(item)}
                    variant="outline"
                    fullWidth
                    style={{ marginTop: theme.spacing.md }}
                  />
                </Card>
              ))}
            </>
          )}

          {reminderTrackerView === "history" && (
            <>
              {pendingReminderHistory.length === 0 &&
                doneReminderHistory.length === 0 && (
                  <EmptyState
                    icon={HistoryIcon}
                    title="No reminder activity yet"
                    description="Completed and pending reminder occurrences will appear here."
                    style={{ marginTop: theme.spacing["2xl"] }}
                  />
                )}

              {pendingReminderHistory.length > 0 && (
                <View style={{ marginTop: theme.spacing["2xl"] }}>
                  <SectionHeader title="Pending" meta={`${pendingReminderHistory.length}`} icon={Clock3} />
                  <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
                    {pendingReminderHistory.map((item) => (
                      <Card key={`pending-${item.reminderId}-${item.occurrenceTs}`} padding="large">
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.md, backgroundColor: theme.colors.warningSoft }}>
                            <Clock3 accessible={false} color={theme.colors.warning} size={20} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleSmall, { color: colors.textPrimary, textAlign: "left" }]}>{item.title}</Text>
                            <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.warning, marginTop: theme.spacing.xs }]}>{formatReminderOccurrenceLabel(item.occurrenceTs, item.timezone)}</Text>
                          </View>
                          <View style={{ flexShrink: 0, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.full, backgroundColor: theme.colors.warningSoft }}>
                            <Text style={[theme.typography.caption, { color: theme.colors.warning }]}>PENDING</Text>
                          </View>
                        </View>
                        {item.note.trim().length > 0 && (
                          <View style={{ marginTop: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSubtle }}>
                            <Text numberOfLines={3} style={[theme.typography.body, { color: colors.textSecondary }]}>{item.note}</Text>
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
                  <SectionHeader title="Completed" meta={`${doneReminderHistory.length}`} icon={CheckCircle2} />
                  <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
                    {doneReminderHistory.map((item) => (
                      <Card key={`done-${item.reminderId}-${item.occurrenceTs}`} padding="large">
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.md }}>
                          <View style={{ width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.md, backgroundColor: theme.colors.successSoft }}>
                            <CheckCircle2 accessible={false} color={theme.colors.success} size={20} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleSmall, { color: colors.textPrimary, textAlign: "left" }]}>{item.title}</Text>
                            <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.success, marginTop: theme.spacing.xs }]}>{formatReminderOccurrenceLabel(item.occurrenceTs, item.timezone)}</Text>
                          </View>
                          <View style={{ flexShrink: 0, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radii.full, backgroundColor: theme.colors.successSoft }}>
                            <Text style={[theme.typography.caption, { color: theme.colors.success }]}>DONE</Text>
                          </View>
                        </View>
                        {item.note.trim().length > 0 && (
                          <View style={{ marginTop: theme.spacing.md, padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSubtle }}>
                            <Text numberOfLines={3} style={[theme.typography.body, { color: colors.textSecondary }]}>{item.note}</Text>
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
                ...theme.shadows.overlay
              }}
            />
          </View>
        )}
      </ScreenLayout>
      <ReminderEditorSheet visible={reminderEditorOpen} editing={Boolean(reminderForm.id)} saving={reminderSaving} error={reminderEditorError} onClose={() => { setReminderEditorOpen(false); setReminderEditorError(""); }} onSave={() => handleSaveReminder().catch(() => undefined)}>
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
              <ChoiceRow<ReminderMode>
                label="Reminder type"
                value={reminderForm.mode}
                layout={shouldStackActions ? "wrap" : "equal"}
                variant="card"
                options={[
                  { value: "time", label: "Recurring" },
                  { value: "multi", label: "Multiple times" },
                  { value: "interval", label: "Interval" },
                  { value: "once", label: "One time" }
                ]}
                onChange={(mode) => {
                  const nextDateLabel = reminderForm.dateLabel || getDeviceTodayLabel();
                  setReminderForm((prev) => ({
                    ...prev,
                    mode,
                    dateLabel: prev.dateLabel || nextDateLabel
                  }));
                  if (mode === "once") {
                    setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(nextDateLabel));
                  }
                }}
                style={{ marginTop: theme.spacing.md }}
              />
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
                      <Card treatment="inset" style={{ borderColor: colors.brandBorder }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: theme.spacing.sm
                          }}
                        >
                          <IconButton
                            icon={ChevronLeft}
                            size="small"
                            variant="standard"
                            accessibilityLabel="Previous month"
                            onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, -1))}
                          />
                          <Text
                            numberOfLines={1}
                            style={[theme.typography.bodyStrong, { minWidth: 0, flex: 1, color: colors.textPrimary, textAlign: "center" }]}
                          >
                            {formatReminderCalendarMonth(reminderCalendarMonth)}
                          </Text>
                          <IconButton
                            icon={ChevronRight}
                            size="small"
                            variant="standard"
                            accessibilityLabel="Next month"
                            onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, 1))}
                          />
                        </View>
                        <View className="mt-3 flex-row">
                          {WEEKDAY_OPTIONS.map((day) => (
                            <View key={`calendar-head-${day.value}`} className="flex-1 items-center">
                              <Text style={[theme.typography.eyebrow, { color: colors.textSecondary }]}>
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
                              <AnimatedPressable
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
                              </AnimatedPressable>
                            );
                          })}
                        </View>
                      </Card>
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
                        <Card key={`slot-${index}`} treatment="inset" style={{ borderColor: colors.brandBorder }}>
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
                            <Button
                              label="Remove time"
                              variant="danger"
                              size="small"
                              onPress={() => setReminderForm((prev) => {
                                const compacted = prev.timeSlots.filter((_, slotIndex) => slotIndex !== index && prev.timeSlots[slotIndex].trim());
                                return { ...prev, timeSlots: ensureReminderTimeInputs(compacted) };
                              })}
                              accessibilityLabel={`Remove time ${index + 1}`}
                              fullWidth
                              style={{ marginTop: theme.spacing.sm }}
                            />
                          )}
                        </Card>
                      );
                    })}
                  </View>
                  {reminderForm.timeSlots.filter((value) => value.trim()).length < 4 && (
                    <Button
                      label="Add another time"
                      variant="outline"
                      fullWidth
                      onPress={() => setReminderForm((prev) => {
                        const compacted = prev.timeSlots.filter((value) => value.trim());
                        const last = parseReminderTimeSlotInput(compacted[compacted.length - 1] ?? "08:00") ?? { hour: 8, minute: 0 };
                        const nextHour = (last.hour + 4) % 24;
                        return { ...prev, timeSlots: ensureReminderTimeInputs([...compacted, formatTimeLabel(nextHour, last.minute)]) };
                      })}
                      style={{ marginTop: theme.spacing.md }}
                    />
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
                  <WeekdayPicker
                    label="Days"
                    value={reminderForm.days}
                    onChange={(days) => setReminderForm((prev) => ({ ...prev, days }))}
                    style={{ marginTop: theme.spacing.md }}
                  />
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
      </ReminderEditorSheet>
    </>
  );
}
