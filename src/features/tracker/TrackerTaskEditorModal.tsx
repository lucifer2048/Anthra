import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar1, CalendarDays, CalendarRange, Check, Repeat2, type LucideIcon } from "lucide-react-native";

import { WEEKDAY_OPTIONS, normalizeDays } from "../../constants/schedule";
import { Button, ScreenHeader, StatusBanner, SwitchRow, TextField } from "../../components/ui";
import { TimePickerField } from "../../components/TimePickerField";
import { useAnthraTheme } from "../../design-system";
import { dateKeyInTimeZone } from "../activity/activityStats";
import { shiftTrackerDate } from "./trackerStats";
import type { TrackerRecurrence, TrackerTask, TrackerTaskInput } from "./trackerTypes";
import { MAX_ONE_TIME_TRACKER_DAYS, validateTrackerTask } from "./trackerValidation";

type Props = {
  visible: boolean;
  trackerId: number;
  task: TrackerTask | null;
  timezone: string;
  saving: boolean;
  onClose: () => void;
  onSave: (input: TrackerTaskInput) => void;
};

type RecurrenceOption = { value: TrackerRecurrence; label: string; description: string; icon: LucideIcon };
const RECURRENCE: RecurrenceOption[] = [
  { value: "daily", label: "Daily", description: "Every day", icon: Repeat2 },
  { value: "weekdays", label: "Days", description: "Choose weekdays", icon: CalendarRange },
  { value: "once", label: "One time", description: "Choose a date", icon: Calendar1 }
];

function formatDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function TrackerTaskEditorModal({
  visible,
  trackerId,
  task,
  timezone,
  saving,
  onClose,
  onSave
}: Props) {
  const theme = useAnthraTheme();
  const today = dateKeyInTimeZone(Date.now(), timezone);
  const [title, setTitle] = useState("");
  const [recurrence, setRecurrence] = useState<TrackerRecurrence>("daily");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [onceDate, setOnceDate] = useState(today);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? "");
    setRecurrence(task?.recurrence ?? "daily");
    setDays(task?.days?.length ? task.days : [1, 2, 3, 4, 5]);
    setOnceDate(task?.onceDate ?? today);
    setNotificationEnabled(task?.notificationEnabled ?? false);
    setHour(task?.notificationHour ?? 9);
    setMinute(task?.notificationMinute ?? 0);
    setDatePickerOpen(false);
    setError("");
  }, [task, today, visible]);

  const input: TrackerTaskInput = {
    id: task?.id,
    trackerId,
    title,
    recurrence,
    days: recurrence === "daily" ? [0, 1, 2, 3, 4, 5, 6] : normalizeDays(days),
    onceDate: recurrence === "once" ? onceDate : null,
    notificationEnabled,
    notificationHour: hour,
    notificationMinute: minute,
    timezone
  };

  const submit = () => {
    const validationError = validateTrackerTask(input);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    onSave(input);
  };

  const pickerDate = (() => {
    const [year, month, day] = onceDate.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  })();
  const handleDate = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setDatePickerOpen(false);
    if (event.type === "dismissed" || !selected) return;
    setOnceDate(
      `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`
    );
  };
  const maximumDate = notificationEnabled
    ? (() => {
        const key = shiftTrackerDate(today, MAX_ONE_TIME_TRACKER_DAYS);
        const [year, month, day] = key.split("-").map(Number);
        return new Date(year, month - 1, day, 12);
      })()
    : undefined;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
        <View style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingHorizontal: theme.layout.screenPadding }}>
          <ScreenHeader
            eyebrow="TRACKER BUDDY"
            title={task ? "Edit task" : "New task"}
            subtitle={task ? "Changes begin today after confirmation" : "Build it around your routine"}
            onBack={onClose}
            backLabel="Close task editor"
          />
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            width: "100%",
            maxWidth: theme.layout.contentMaxWidth,
            alignSelf: "center",
            padding: theme.layout.screenPadding,
            paddingBottom: theme.spacing["6xl"]
          }}
        >
          {error ? <StatusBanner variant="danger" title="Check this task" message={error} style={{ marginBottom: theme.spacing.lg }} /> : null}
          <TextField
            label="Task name"
            required
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="Drink 500 ml before lunch"
            returnKeyType="done"
          />

          <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm }]}>REPEATS</Text>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {RECURRENCE.map((option) => {
              const selected = recurrence === option.value;
              const OptionIcon = option.icon;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setRecurrence(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 112,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: theme.spacing.md,
                    borderRadius: theme.radii.lg,
                    borderWidth: 2,
                    borderColor: selected ? theme.colors.brand : theme.colors.borderStrong,
                    backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated
                  })}
                >
                  <View style={{
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: theme.radii.full,
                    backgroundColor: selected ? theme.colors.surface : theme.colors.surfaceSubtle
                  }}>
                    <OptionIcon accessible={false} color={selected ? theme.colors.brand : theme.colors.textSecondary} size={18} />
                  </View>
                  <Text style={[theme.typography.bodyStrong, { color: selected ? theme.colors.brand : theme.colors.textPrimary, marginTop: theme.spacing.sm, textAlign: "center" }]}>{option.label}</Text>
                  <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 2, textAlign: "center" }]}>{option.description}</Text>
                </Pressable>
              );
            })}
          </View>

          {recurrence === "weekdays" && (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>CHOOSE DAYS</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {WEEKDAY_OPTIONS.map((day) => {
                  const selected = days.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      onPress={() => setDays((current) => selected ? current.filter((value) => value !== day.value) : [...current, day.value])}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      style={({ pressed }) => ({
                        width: "22%",
                        flexGrow: 1,
                        minHeight: 58,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: theme.radii.md,
                        borderWidth: 2,
                        borderColor: selected ? theme.colors.brand : theme.colors.borderStrong,
                        backgroundColor: selected ? theme.colors.brandSoft : pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated
                      })}
                    >
                      {selected && <Check accessible={false} color={theme.colors.brand} size={15} style={{ marginBottom: 2 }} />}
                      <Text style={[theme.typography.label, { color: selected ? theme.colors.brand : theme.colors.textPrimary }]}>{day.short}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {recurrence === "once" && (
            <View style={{ marginTop: theme.spacing.lg }}>
              <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>DATE</Text>
              <Pressable
                onPress={() => setDatePickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Task date, ${formatDate(onceDate)}`}
                style={({ pressed }) => ({
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: theme.spacing.md,
                  paddingHorizontal: theme.spacing.lg,
                  borderRadius: theme.radii.lg,
                  borderWidth: 2,
                  borderColor: theme.colors.borderStrong,
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated
                })}
              >
                <CalendarDays color={theme.colors.brand} size={20} />
                <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary, flex: 1 }]}>{formatDate(onceDate)}</Text>
                <Text style={[theme.typography.label, { color: theme.colors.brand }]}>Change</Text>
              </Pressable>
              {datePickerOpen && (
                <View style={Platform.OS === "ios" ? { marginTop: theme.spacing.sm, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surfaceSubtle } : undefined}>
                  <DateTimePicker
                    value={pickerDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "inline" : "default"}
                    minimumDate={new Date()}
                    maximumDate={maximumDate}
                    onChange={handleDate}
                    themeVariant={theme.mode}
                    accentColor={theme.colors.brand}
                  />
                  {Platform.OS === "ios" && <Button label="Done" variant="secondary" onPress={() => setDatePickerOpen(false)} fullWidth />}
                </View>
              )}
            </View>
          )}

          <View style={{ marginTop: theme.spacing.xl }}>
            <SwitchRow
              label="Notify me"
              description="This task gets its own optional alert. Other tasks are unaffected."
              value={notificationEnabled}
              onValueChange={setNotificationEnabled}
              style={{
                minHeight: 84,
                borderWidth: 2,
                borderColor: notificationEnabled ? theme.colors.brand : theme.colors.borderStrong,
                backgroundColor: notificationEnabled ? theme.colors.brandSoft : theme.colors.surfaceElevated
              }}
            />
          </View>
          {notificationEnabled && (
            <View style={{ marginTop: theme.spacing.lg }}>
              <TimePickerField emphasized label="Notification time" hour={hour} minute={minute} onChange={(nextHour, nextMinute) => {
                setHour(nextHour);
                setMinute(nextMinute);
              }} />
              <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
                One-time alerts must be at least one minute ahead and no more than one year away.
              </Text>
            </View>
          )}

          <Button
            label={task ? "Review changes" : "Add task"}
            icon={Check}
            onPress={submit}
            loading={saving}
            fullWidth
            size="large"
            style={{ marginTop: theme.spacing["2xl"] }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}
