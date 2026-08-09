import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Calendar1, CalendarRange, Repeat2, type LucideIcon } from "lucide-react-native";

import { normalizeDays } from "../../constants/schedule";
import { ChoiceRow, DatePickerField, SheetDialog, StatusBanner, SwitchRow, TextField, TimePickerField, WeekdayPicker } from "../../components/ui";
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
  const handleDate = (selected: Date) => {
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
    <SheetDialog
      visible={visible}
      title={task ? "Edit task" : "New task"}
      subtitle={task ? "Changes begin today after confirmation" : "Build it around your routine"}
      onClose={onClose}
      backdropDismissEnabled={!saving}
      primaryAction={{ label: task ? "Review changes" : "Add task", onPress: submit, loading: saving }}
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

          <ChoiceRow label="Repeats" options={RECURRENCE} value={recurrence} onChange={setRecurrence} layout="equal" variant="card" style={{ marginTop: theme.spacing.xl }} />

          {recurrence === "weekdays" && (
            <WeekdayPicker
              label="CHOOSE DAYS"
              value={days}
              onChange={setDays}
              style={{ marginTop: theme.spacing.lg }}
            />
          )}

          {recurrence === "once" && (
            <DatePickerField label="Date" value={pickerDate} onChange={handleDate} minimumDate={new Date()} maximumDate={maximumDate} style={{ marginTop: theme.spacing.lg }} />
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

    </SheetDialog>
  );
}
