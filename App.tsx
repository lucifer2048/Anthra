import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  Pressable,
  Share,
  ScrollView,
  Text,
  type TextInput,
  ToastAndroid,
  useColorScheme as useSystemColorScheme,
  useWindowDimensions,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as LocalAuthentication from "expo-local-authentication";
import * as Clipboard from "expo-clipboard";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { CheckCircle2, Clock3, History as HistoryIcon, Share2, Star, Trash2 } from "lucide-react-native";

import "./global.css";
import "./src/utils/reminderNotificationTask";
import { PlanEditorModal } from "./src/components/PlanEditorModal";
import { PasswordManagerScreen } from "./src/components/PasswordManagerScreen";
import { ProgressBar } from "./src/components/ProgressBar";
import { STREAK_CARD_HEIGHT, STREAK_CARD_WIDTH, StreakCard } from "./src/components/StreakCard";
import { TimerScreen } from "./src/components/TimerScreen";
import { TimePickerField } from "./src/components/TimePickerField";
import { ListBuddyScreen } from "./src/components/ListBuddyScreen";
import { AlarmBuddyScreen } from "./src/components/AlarmBuddyScreen";
import { AppearanceControl } from "./src/components/AppearanceControl";
import { LaunchOverlay } from "./src/components/LaunchOverlay";
import { VaultResetPinModal } from "./src/components/VaultResetPinModal";
import { VaultEntryModal } from "./src/components/VaultEntryModal";
import { VaultPinModal } from "./src/components/VaultPinModal";
import { WorkoutTabBar, type WorkoutTab } from "./src/components/WorkoutTabBar";
import { ReminderTabBar, type ReminderTab } from "./src/components/ReminderTabBar";
import { ActivityBuddyScreen } from "./src/features/activity/ActivityBuddyScreen";
import { AnthraHomeScreen } from "./src/features/hub/AnthraHomeScreen";
import { TrackerBuddyScreen } from "./src/features/tracker/TrackerBuddyScreen";
import { syncTrackerNotifications } from "./src/features/tracker/trackerNotifications";
import { resolveTheme, ThemeProvider, themes, type ThemeMode } from "./src/design-system";
import { Button, Card, IconButton, KeyboardAwareScrollView, ScreenHeader, StatusBanner, SwitchRow, TextField } from "./src/components/ui";
import {
  clearActiveWorkoutSnapshot,
  createAnthraBackup,
  deletePlan,
  deleteReminderItem,
  deleteWorkoutSession,
  deleteVaultEntry,
  finalizeWorkoutSession,
  getActiveWorkoutSnapshot,
  getAppThemeMode,
  getAlarmItems,
  getDashboardStats,
  getPlans,
  getReminderCompletionEntries,
  getReminderItems,
  getUserProfile,
  getUserSettings,
  getVaultEntries,
  getVaultSecuritySettings,
  getWorkoutHistory,
  initDatabase,
  logWorkoutCompletion,
  markReminderOccurrenceDone,
  saveActiveWorkoutSnapshot,
  saveAppThemeMode,
  savePlan,
  saveReminderItem,
  saveVaultEntry,
  saveVaultPin,
  saveWorkoutSessionFeedback,
  setReminderItemEnabled,
  setVaultBiometricsEnabled as saveVaultBiometricsEnabled,
  saveUserProfile,
  saveUserSettings,
  startWorkoutSession,
  restoreAnthraBackup,
  verifyVaultPin
} from "./src/db";
import { WEEKDAY_OPTIONS, formatDays, matchesDay, normalizeDays } from "./src/constants/schedule";
import type {
  ActiveWorkoutSnapshot,
  DashboardStats,
  ReminderCompletionEntry,
  ReminderInput,
  ReminderItem,
  ReminderMode,
  ReminderTimeSlot,
  UserProfile,
  UserSettings,
  VaultEntry,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput,
  WorkoutRunSummary,
  WorkoutTimerState
} from "./src/types";
import { syncWorkoutReminderDelivery } from "./src/utils/reminders";
import { syncReminderBuddyNotifications, setupNotificationResponseListener } from "./src/utils/reminderBuddy";
import {
  getNotificationHealth,
  sendTestNotification,
  type NotificationHealth
} from "./src/utils/notificationHealth";
import {
  formatTimestampInTimeZone,
  getDayPartsInTimeZone,
  getDeviceTimeZone,
  getTodayLabelInTimeZone,
  zonedDateTimeToTimestamp
} from "./src/utils/timezone";
import { generateStrongPassword } from "./src/utils/passwords";
import {
  getAlarmPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  replaceNativeAlarms,
  syncWorkoutAlarmReminders
} from "./src/utils/alarmNative";
import {
  createPlanShareFileContents,
  createPlanShareMessage,
  isPlanShareUrl,
  parsePlanShareText,
  parsePlanShareUrl
} from "./src/utils/planSharing";
import { getPlansForWeekday, getScheduledWorkoutDays } from "./src/utils/workoutSchedule";
import { parseReminderDateParts, validateOneTimeReminder } from "./src/utils/reminderValidation";
import {
  getVaultPinAttemptStatus,
  INITIAL_VAULT_PIN_ATTEMPT_STATE,
  registerVaultPinFailure,
  registerVaultPinSuccess
} from "./src/features/vault/pinAttemptPolicy";

type AppModule = "hub" | "workout" | "reminder" | "password" | "list" | "alarm" | "activity" | "tracker";

type ModuleTheme = {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  icon: string;
  onAccent: string;
};

type ReminderFormState = {
  id?: number;
  title: string;
  mode: ReminderMode;
  hour: string;
  minute: string;
  dateLabel: string;
  note: string;
  days: number[];
  timeSlots: string[];
  intervalMinutes: string;
  intervalStartHour: string;
  intervalStartMinute: string;
  intervalEndHour: string;
  intervalEndMinute: string;
  enabled: boolean;
};

type ReminderHistoryItem = {
  reminderId: number;
  occurrenceTs: number;
  title: string;
  note: string;
  mode: ReminderMode;
  timezone: string;
  done: boolean;
};

type ReminderCalendarDay = {
  dateLabel: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
};

type VaultFormState = {
  id?: number;
  appName: string;
  accountId: string;
  secret: string;
};

const INITIAL_STATS: DashboardStats = {
  currentStreak: 0,
  bestStreak: 0,
  streakWeeks: 0,
  totalWorkouts: 0,
  averageWorkoutSeconds: 0,
  weekCompleted: 0,
  weekGoal: 4
};

const INITIAL_SETTINGS: UserSettings = {
  workoutDays: [1, 3, 5],
  weeklyGoal: 4,
  reminderHour: 18,
  reminderMinute: 0,
  reminderLeadMinutes: [60],
  notificationsEnabled: false,
  reminderDelivery: "notification",
  timezone: getDeviceTimeZone()
};

const INITIAL_REMINDER_FORM: ReminderFormState = {
  title: "",
  mode: "time",
  hour: "9",
  minute: "0",
  dateLabel: "",
  note: "",
  days: [],
  timeSlots: ["08:00", "13:00", "20:00", ""],
  intervalMinutes: "60",
  intervalStartHour: "8",
  intervalStartMinute: "0",
  intervalEndHour: "22",
  intervalEndMinute: "0",
  enabled: true
};

const INITIAL_VAULT_FORM: VaultFormState = {
  appName: "",
  accountId: "",
  secret: ""
};

function withAlpha(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) return hex;
  const parsed = Number.parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function resolveModuleTheme(isDarkMode: boolean): ModuleTheme {
  const colors = isDarkMode ? themes.dark.colors : themes.light.colors;
  return {
    accent: colors.brand,
    accentSoft: colors.brandSoft,
    accentBorder: colors.brandBorder,
    icon: colors.brand,
    onAccent: colors.textOnBrandSolid
  };
}

function formatHistoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function parsePositiveNumber(input: string): number | null {
  const sanitized = input.replace(/[^0-9.]/g, "");
  if (!sanitized) return null;
  const value = Number(sanitized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10) / 10;
}

function formatMetricValue(value: number | null): string {
  if (value == null) return "";
  return Number.isInteger(value) ? String(value) : String(value);
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function parseStrictWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function normalizeReminderLeadMinutes(values: number[]): number[] {
  const normalized = values
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));
  const deduped = Array.from(new Set(normalized));
  deduped.sort((a, b) => b - a);
  return deduped.slice(0, 3);
}

function ensureThreeLeadInputs(values: number[]): string[] {
  const normalized = normalizeReminderLeadMinutes(values);
  return [
    String(normalized[0] ?? 60),
    String(normalized[1] ?? 30),
    String(normalized[2] ?? 15)
  ];
}

function formatTimeLabel(hour: number, minute: number): string {
  const safeHour = Math.min(23, Math.max(0, Math.floor(Number(hour) || 0)));
  const safeMinute = Math.min(59, Math.max(0, Math.floor(Number(minute) || 0)));
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function formatReminderDays(days: number[]): string {
  const normalized = normalizeDays(days);
  if (normalized.length === 0) return "Every day";
  return formatDays(normalized);
}

const REMINDER_HISTORY_PAST_DAYS = 7;

function formatDateInput(baseDate: Date): string {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + 1;
  const day = baseDate.getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDeviceTodayLabel(): string {
  return getTodayLabelInTimeZone(getDeviceTimeZone());
}

function ensureReminderTimeInputs(values: string[]): string[] {
  return Array.from({ length: 4 }, (_, index) => values[index] ?? "");
}

function formatReminderCalendarMonth(cursor: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(cursor);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function getReminderCalendarMonthFromDateLabel(dateLabel: string): string {
  const parts = parseReminderDateParts(dateLabel);
  if (!parts) {
    const today = parseReminderDateParts(getDeviceTodayLabel());
    if (!today) return "";
    return `${String(today.year).padStart(4, "0")}-${String(today.month).padStart(2, "0")}`;
  }
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

function shiftReminderCalendarMonth(cursor: string, monthDelta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(cursor);
  if (!match) return getReminderCalendarMonthFromDateLabel(getDeviceTodayLabel());
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + monthDelta, 1));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildReminderCalendarDays(monthCursor: string): ReminderCalendarDay[] {
  const match = /^(\d{4})-(\d{2})$/.exec(monthCursor);
  if (!match) return [];

  const year = Number(match[1]);
  const month = Number(match[2]);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - firstWeekday));
  const todayLabel = getDeviceTodayLabel();
  const todayParts = parseReminderDateParts(todayLabel);
  const todayTs =
    todayParts == null ? null : Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day, 0, 0, 0, 0);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getTime() + index * 24 * 60 * 60 * 1000);
    const dateLabel = formatDateInput(date);
    const cellTs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0);
    return {
      dateLabel,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() + 1 === month,
      isToday: dateLabel === todayLabel,
      isPast: todayTs != null ? cellTs < todayTs : false
    };
  });
}

function parseReminderTimeSlotInput(value: string): ReminderTimeSlot | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function formatReminderModeLabel(mode: ReminderMode): string {
  switch (mode) {
    case "interval":
      return "Interval";
    case "multi":
      return "Multiple times";
    case "once":
      return "One time";
    default:
      return "Recurring";
  }
}

function formatReminderSchedule(item: ReminderItem): string {
  const timezone = item.timezone || getDeviceTimeZone();
  if (item.mode === "once") {
    const dateLabel = item.dateLabel ?? "No date";
    return `One time • ${dateLabel} • ${formatTimeLabel(item.hour, item.minute)} • ${timezone}`;
  }

  if (item.mode === "multi") {
    const slots = item.timeSlots.map((slot) => formatTimeLabel(slot.hour, slot.minute)).join(", ");
    return `${item.timeSlots.length} time${item.timeSlots.length === 1 ? "" : "s"} • ${slots} • ${formatReminderDays(item.days)} • ${timezone}`;
  }

  if (item.mode === "interval") {
    const start = formatTimeLabel(item.intervalStartHour ?? 8, item.intervalStartMinute ?? 0);
    const end = formatTimeLabel(item.intervalEndHour ?? 22, item.intervalEndMinute ?? 0);
    return `Every ${item.intervalMinutes ?? 60} min • ${start}-${end} • ${formatReminderDays(item.days)} • ${timezone}`;
  }

  return `${formatTimeLabel(item.hour, item.minute)} • ${formatReminderDays(item.days)} • ${timezone}`;
}

function formatReminderOccurrenceLabel(timestamp: number, timezone: string): string {
  return `${formatTimestampInTimeZone(timestamp, timezone)} • ${timezone}`;
}

function buildReminderHistoryOccurrences(
  reminder: ReminderItem,
  nowMs: number,
  pastDays: number,
  futureDays: number
): number[] {
  const candidates: number[] = [];
  const timezone = reminder.timezone || getDeviceTimeZone();

  if (reminder.mode === "once") {
    const parts = parseReminderDateParts(reminder.dateLabel ?? "");
    if (!parts) return [];
    const timestamp = zonedDateTimeToTimestamp(
      parts.year,
      parts.month,
      parts.day,
      reminder.hour,
      reminder.minute,
      timezone
    );
    const minTs = nowMs - pastDays * 24 * 60 * 60 * 1000;
    const maxTs = nowMs + futureDays * 24 * 60 * 60 * 1000;
    return timestamp >= minTs && timestamp <= maxTs ? [timestamp] : [];
  }

  const allowedDays = normalizeDays(reminder.days);
  const effectiveDays = allowedDays.length > 0 ? allowedDays : [0, 1, 2, 3, 4, 5, 6];
  const daySet = new Set<number>(effectiveDays);

  for (let dayOffset = -pastDays; dayOffset <= futureDays; dayOffset += 1) {
    const slot = getDayPartsInTimeZone(nowMs, dayOffset, timezone);
    if (!daySet.has(slot.weekday)) continue;

    if (reminder.mode === "time") {
      candidates.push(
        zonedDateTimeToTimestamp(
          slot.year,
          slot.month,
          slot.day,
          reminder.hour,
          reminder.minute,
          timezone
        )
      );
      continue;
    }

    if (reminder.mode === "multi") {
      for (const timeSlot of reminder.timeSlots) {
        candidates.push(
          zonedDateTimeToTimestamp(
            slot.year,
            slot.month,
            slot.day,
            timeSlot.hour,
            timeSlot.minute,
            timezone
          )
        );
      }
      continue;
    }

    const interval = Math.max(5, Math.floor(reminder.intervalMinutes ?? 0));
    const startHour = Math.min(23, Math.max(0, Math.floor(reminder.intervalStartHour ?? 8)));
    const startMinute = Math.min(59, Math.max(0, Math.floor(reminder.intervalStartMinute ?? 0)));
    const endHour = Math.min(23, Math.max(0, Math.floor(reminder.intervalEndHour ?? 22)));
    const endMinute = Math.min(59, Math.max(0, Math.floor(reminder.intervalEndMinute ?? 0)));
    const startTotal = startHour * 60 + startMinute;
    const endTotal = endHour * 60 + endMinute;
    if (endTotal <= startTotal) continue;

    for (let cursor = startTotal; cursor <= endTotal; cursor += interval) {
      const hour = Math.floor(cursor / 60);
      const minute = cursor % 60;
      candidates.push(
        zonedDateTimeToTimestamp(slot.year, slot.month, slot.day, hour, minute, timezone)
      );
    }
  }

  return Array.from(new Set(candidates)).sort((left, right) => left - right);
}

export default function App() {
  const systemColorScheme = useSystemColorScheme();
  const { fontScale, width: windowWidth } = useWindowDimensions();
  const deviceTimeZone = useMemo(() => getDeviceTimeZone(), []);
  const workoutTimeZoneOptions = useMemo(
    () => Array.from(new Set([deviceTimeZone, "Asia/Kolkata"])),
    [deviceTimeZone]
  );
  const [ready, setReady] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<WorkoutTab>("home");
  const [planListMode, setPlanListMode] = useState<"all" | "today">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [activeTimerInitialState, setActiveTimerInitialState] = useState<WorkoutTimerState | null>(null);
  const [recoverableWorkout, setRecoverableWorkout] = useState<ActiveWorkoutSnapshot | null>(null);
  const [profileHeightCm, setProfileHeightCm] = useState("");
  const [profileWeightKg, setProfileWeightKg] = useState("");
  const [profileGoal, setProfileGoal] = useState("");
  const profileWeightInputRef = useRef<TextInput>(null);
  const profileGoalInputRef = useRef<TextInput>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [settings, setSettings] = useState<UserSettings>(INITIAL_SETTINGS);
  const [weeklyGoalText, setWeeklyGoalText] = useState(String(INITIAL_SETTINGS.weeklyGoal));
  const [reminderHourText, setReminderHourText] = useState(String(INITIAL_SETTINGS.reminderHour));
  const [reminderMinuteText, setReminderMinuteText] = useState(String(INITIAL_SETTINGS.reminderMinute));
  const [reminderCount, setReminderCount] = useState(1);
  const [reminderLeadTexts, setReminderLeadTexts] = useState<string[]>(
    ensureThreeLeadInputs(INITIAL_SETTINGS.reminderLeadMinutes)
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSessionId, setFeedbackSessionId] = useState<number | null>(null);
  const [feedbackPlanName, setFeedbackPlanName] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackNoteModalOpen, setFeedbackNoteModalOpen] = useState(false);
  const [workoutCompletionTransition, setWorkoutCompletionTransition] = useState(false);
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const [activeModule, setActiveModule] = useState<AppModule>("hub");
  const [reminderItems, setReminderItems] = useState<ReminderItem[]>([]);
  const [reminderCompletions, setReminderCompletions] = useState<ReminderCompletionEntry[]>([]);
  const [reminderTrackerView, setReminderTrackerView] = useState<ReminderTab>("reminders");
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [reminderForm, setReminderForm] = useState<ReminderFormState>(INITIAL_REMINDER_FORM);
  const [reminderCalendarMonth, setReminderCalendarMonth] = useState(getReminderCalendarMonthFromDateLabel(getDeviceTodayLabel()));
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
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [vaultEditorOpen, setVaultEditorOpen] = useState(false);
  const [vaultForm, setVaultForm] = useState<VaultFormState>(INITIAL_VAULT_FORM);
  const [vaultEditorError, setVaultEditorError] = useState("");
  const [vaultSaving, setVaultSaving] = useState(false);
  const [vaultHasPin, setVaultHasPin] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultNewPin, setVaultNewPin] = useState("");
  const [vaultConfirmPin, setVaultConfirmPin] = useState("");
  const [vaultResetPinOpen, setVaultResetPinOpen] = useState(false);
  const [vaultCurrentPin, setVaultCurrentPin] = useState("");
  const [vaultReplacementPin, setVaultReplacementPin] = useState("");
  const [vaultReplacementPinConfirm, setVaultReplacementPinConfirm] = useState("");
  const [vaultResetPinSaving, setVaultResetPinSaving] = useState(false);
  const [vaultResetPinError, setVaultResetPinError] = useState("");
  const [vaultBiometricsEnabled, setVaultBiometricsEnabled] = useState(false);
  const [revealedVaultIds, setRevealedVaultIds] = useState<number[]>([]);
  const [vaultNotice, setVaultNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"unlock" | "reveal" | "copy">("unlock");
  const [pinModalInput, setPinModalInput] = useState("");
  const [pinModalError, setPinModalError] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinModalTargetEntryId, setPinModalTargetEntryId] = useState<number | null>(null);
  const vaultPinAttemptRef = useRef(INITIAL_VAULT_PIN_ATTEMPT_STATE);
  const vaultClipboardValueRef = useRef<string | null>(null);
  const vaultClipboardClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pinVerificationRequestRef = useRef(0);
  const vaultBiometricActionInProgressRef = useRef(false);
  const shareCardRef = useRef<View>(null);
  const completionLoggedRef = useRef(false);
  const lastBackPressRef = useRef(0);
  const notificationSyncInProgressRef = useRef(false);
  const lastNotificationSyncRef = useRef(0);
  const workoutAlarmPermissionSetupRef = useRef(false);
  const workoutAlarmPermissionPromptVisibleRef = useRef(false);
  const pendingReminderHistoryNavigationRef = useRef(false);
  const workoutFlowBusyRef = useRef(false);
  const workoutSnapshotSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledPlanShareUrlsRef = useRef(new Set<string>());
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleThemeModeChange = useCallback((nextMode: ThemeMode) => {
    setThemeMode(nextMode);
    saveAppThemeMode(nextMode).catch(() => undefined);
  }, []);

  const promptForWorkoutAlarmPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return false;
    const status = await getAlarmPermissionStatus();
    if (!status.nativeSupported) return false;

    const missingPermission = !status.exactAlarm
      ? {
          title: "Allow alarms & reminders",
          message: "Android requires this system permission for Anthra to ring workout alarms at the exact reminder time.",
          open: openExactAlarmSettings
        }
      : !status.fullScreenIntent
        ? {
            title: "Allow full-screen alarms",
            message: "Allow Anthra to open workout alarms full-screen, including while your phone is locked.",
            open: openFullScreenIntentSettings
          }
        : null;

    if (!missingPermission) {
      workoutAlarmPermissionSetupRef.current = false;
      return true;
    }
    if (workoutAlarmPermissionPromptVisibleRef.current) return false;

    workoutAlarmPermissionPromptVisibleRef.current = true;
    Alert.alert(
      missingPermission.title,
      missingPermission.message,
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            workoutAlarmPermissionPromptVisibleRef.current = false;
            workoutAlarmPermissionSetupRef.current = false;
          }
        },
        {
          text: "Open settings",
          onPress: () => {
            workoutAlarmPermissionPromptVisibleRef.current = false;
            workoutAlarmPermissionSetupRef.current = true;
            missingPermission.open().catch((error) => {
              workoutAlarmPermissionSetupRef.current = false;
              Alert.alert(
                "Could not open settings",
                error instanceof Error ? error.message : "Open Android settings and allow alarm access for Anthra."
              );
            });
          }
        }
      ],
      {
        cancelable: true,
        onDismiss: () => {
          workoutAlarmPermissionPromptVisibleRef.current = false;
        }
      }
    );
    return false;
  }, []);

  workoutFlowBusyRef.current = Boolean(
    activePlan || feedbackOpen || feedbackNoteModalOpen || workoutCompletionTransition
  );

  const clearCopiedVaultPassword = useCallback(async () => {
    const copiedValue = vaultClipboardValueRef.current;
    vaultClipboardValueRef.current = null;
    if (vaultClipboardClearTimeoutRef.current) {
      clearTimeout(vaultClipboardClearTimeoutRef.current);
      vaultClipboardClearTimeoutRef.current = null;
    }
    if (!copiedValue) return;

    const currentValue = await Clipboard.getStringAsync().catch(() => "");
    if (currentValue === copiedValue) {
      await Clipboard.setStringAsync("").catch(() => undefined);
    }
  }, []);

  const cancelPinVerification = useCallback(() => {
    pinVerificationRequestRef.current += 1;
    setPinVerifying(false);
    setPinModalOpen(false);
  }, []);

  const refreshDashboard = useCallback(async () => {
    const latestStats = await getDashboardStats();
    setStats(latestStats);
  }, []);

  const refreshHistory = useCallback(async () => {
    const latestHistory = await getWorkoutHistory();
    setHistory(latestHistory);
  }, []);

  const refreshData = useCallback(async () => {
    const [latestPlans, latestStats, latestHistory] = await Promise.all([
      getPlans(),
      getDashboardStats(),
      getWorkoutHistory()
    ]);
    setPlans(latestPlans);
    setStats(latestStats);
    setHistory(latestHistory);
    return { plans: latestPlans, stats: latestStats, history: latestHistory };
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await getUserProfile();
    setProfileHeightCm(formatMetricValue(profile.heightCm));
    setProfileWeightKg(formatMetricValue(profile.weightKg));
    setProfileGoal(profile.goal);
  }, []);

  const refreshSettings = useCallback(async (): Promise<UserSettings> => {
    const nextSettings = await getUserSettings();
    setSettings(nextSettings);
    setWeeklyGoalText(String(nextSettings.weeklyGoal));
    setReminderHourText(String(nextSettings.reminderHour));
    setReminderMinuteText(String(nextSettings.reminderMinute));
    const leadInputs = ensureThreeLeadInputs(nextSettings.reminderLeadMinutes);
    const normalizedCount = Math.min(
      3,
      Math.max(1, normalizeReminderLeadMinutes(nextSettings.reminderLeadMinutes).length)
    );
    setReminderLeadTexts(leadInputs);
    setReminderCount(normalizedCount);
    return nextSettings;
  }, []);

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

  const refreshVaultSecurity = useCallback(async () => {
    const security = await getVaultSecuritySettings();
    setVaultHasPin(security.hasPin);
    setVaultBiometricsEnabled(security.biometricsEnabled);
    return security;
  }, []);

  const refreshVaultEntries = useCallback(async () => {
    const items = await getVaultEntries();
    setVaultEntries(items);
    return items;
  }, []);

  const syncAllNotifications = useCallback(
    async (
      nextSettings: UserSettings,
      nextPlans: WorkoutPlan[],
      nextReminders: ReminderItem[],
      nextCompletions: ReminderCompletionEntry[],
      force = false
    ) => {
      if (notificationSyncInProgressRef.current) return false;
      if (!force && Date.now() - lastNotificationSyncRef.current < 15 * 60_000) return false;

      notificationSyncInProgressRef.current = true;
      try {
        await Promise.all([
          syncWorkoutReminderDelivery(
            nextSettings,
            getScheduledWorkoutDays(nextPlans, nextSettings.workoutDays)
          ),
          syncReminderBuddyNotifications(nextReminders, nextCompletions),
          syncTrackerNotifications()
        ]);
        lastNotificationSyncRef.current = Date.now();
        return true;
      } finally {
        notificationSyncInProgressRef.current = false;
      }
    },
    []
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

  const bootstrap = useCallback(async () => {
    await initDatabase();
    const [nextData, , nextSettings, nextReminders, nextReminderCompletions, , recoveredWorkout, storedThemeMode] = await Promise.all([
      refreshData(),
      refreshProfile(),
      refreshSettings(),
      refreshReminderItems(),
      refreshReminderCompletions(),
      refreshVaultSecurity(),
      getActiveWorkoutSnapshot(),
      getAppThemeMode()
    ]);
    setRecoverableWorkout(recoveredWorkout);
    setThemeMode(storedThemeMode);
    setReady(true);
    setTimeout(() => {
      syncAllNotifications(nextSettings, nextData.plans, nextReminders, nextReminderCompletions, true).catch(() => undefined);
    }, 250);
  }, [refreshData, refreshProfile, refreshReminderCompletions, refreshReminderItems, refreshSettings, refreshVaultSecurity, syncAllNotifications]);

  useEffect(() => {
    let cancelled = false;
    setBootstrapError(null);
    bootstrap().catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : "Failed to start app.";
      setBootstrapError(message);
      setShowSplashOverlay(false);
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrap, bootstrapAttempt]);

  useEffect(() => {
    if (!ready) return;
    let cleanup: (() => void) | undefined;
    setupNotificationResponseListener(
      async (reminderId, occurrenceTs) => {
        try {
          await markReminderOccurrenceDone(reminderId, occurrenceTs);
          await refreshReminderCompletions();
        } catch {
          // Silently ignore - the user can still mark it done in the app.
        }
      },
      () => {
        if (workoutFlowBusyRef.current) {
          pendingReminderHistoryNavigationRef.current = true;
          return;
        }
        setActiveModule("reminder");
        setReminderTrackerView("history");
      }
    ).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [ready, refreshReminderCompletions]);

  useEffect(() => {
    if (activePlan || feedbackOpen || feedbackNoteModalOpen || workoutCompletionTransition) return;
    if (!pendingReminderHistoryNavigationRef.current) return;
    pendingReminderHistoryNavigationRef.current = false;
    setActiveModule("reminder");
    setReminderTrackerView("history");
  }, [activePlan, feedbackNoteModalOpen, feedbackOpen, workoutCompletionTransition]);

  useEffect(() => {
    if (!ready || activeModule !== "reminder") return;
    refreshNotificationHealth().catch(() => undefined);
  }, [activeModule, ready, refreshNotificationHealth]);

  useEffect(() => {
    if (!ready || !showSplashOverlay) return;
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true
    }).start(() => {
      setShowSplashOverlay(false);
    });
  }, [ready, showSplashOverlay, splashOpacity]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      refreshDashboard().catch(() => undefined);
      refreshHistory().catch(() => undefined);
      refreshReminderCompletions().catch(() => undefined);
    }, 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        Promise.all([refreshData(), refreshSettings(), refreshReminderItems(), refreshReminderCompletions()])
          .then(async ([nextData, nextSettings, nextReminders, nextCompletions]) => {
            const shouldRetryWorkoutAlarm =
              nextSettings.notificationsEnabled &&
              (nextSettings.reminderDelivery === "alarm" || nextSettings.reminderDelivery === "both");
            if (workoutAlarmPermissionSetupRef.current && shouldRetryWorkoutAlarm) {
              await promptForWorkoutAlarmPermission();
            }
            const syncedEverything = await syncAllNotifications(
              nextSettings,
              nextData.plans,
              nextReminders,
              nextCompletions
            );
            if (!syncedEverything && shouldRetryWorkoutAlarm) {
              await syncWorkoutAlarmReminders(
                nextSettings,
                getScheduledWorkoutDays(nextData.plans, nextSettings.workoutDays)
              );
            }
          })
          .catch(() => undefined);
      } else {
        clearCopiedVaultPassword().catch(() => undefined);
        Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
        revealTimeoutsRef.current = {};
        setVaultUnlocked(false);
        setVaultEntries([]);
        setRevealedVaultIds([]);
        setVaultEditorOpen(false);
        setVaultForm(INITIAL_VAULT_FORM);
        setVaultEditorError("");
        setVaultSaving(false);
        setVaultResetPinOpen(false);
        cancelPinVerification();
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [cancelPinVerification, clearCopiedVaultPassword, promptForWorkoutAlarmPermission, ready, refreshDashboard, refreshData, refreshHistory, refreshReminderCompletions, refreshReminderItems, refreshSettings, syncAllNotifications]);

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
    if (!profileNotice) return;
    const timeout = setTimeout(() => {
      setProfileNotice(null);
    }, 2500);
    return () => clearTimeout(timeout);
  }, [profileNotice]);

  useEffect(() => {
    if (!settingsNotice) return;
    const timeout = setTimeout(() => {
      setSettingsNotice(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [settingsNotice]);

  useEffect(() => {
    if (!reminderNotice) return;
    const timeout = setTimeout(() => {
      setReminderNotice(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [reminderNotice]);

  useEffect(() => {
    if (!vaultNotice) return;
    const timeout = setTimeout(() => {
      setVaultNotice(null);
    }, 3200);
    return () => clearTimeout(timeout);
  }, [vaultNotice]);

  useEffect(() => {
    if (activeModule === "password") return;
    clearCopiedVaultPassword().catch(() => undefined);
    Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
    revealTimeoutsRef.current = {};
    setVaultUnlocked(false);
    setVaultEntries([]);
    setRevealedVaultIds([]);
    setVaultEditorOpen(false);
    setVaultForm(INITIAL_VAULT_FORM);
    setVaultEditorError("");
    setVaultSaving(false);
    cancelPinVerification();
    setPinModalError("");
    setPinModalInput("");
    setPinModalTargetEntryId(null);
    setVaultResetPinOpen(false);
    setVaultCurrentPin("");
    setVaultReplacementPin("");
    setVaultReplacementPinConfirm("");
    setVaultResetPinError("");
  }, [activeModule, cancelPinVerification, clearCopiedVaultPassword]);

  useEffect(() => {
    return () => {
      clearCopiedVaultPassword().catch(() => undefined);
      Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
      if (workoutSnapshotSaveRef.current) clearTimeout(workoutSnapshotSaveRef.current);
    };
  }, [clearCopiedVaultPassword]);

  const openCreatePlan = () => {
    setEditingPlan(null);
    setEditorOpen(true);
  };

  const openEditPlan = (plan: WorkoutPlan) => {
    setEditingPlan(plan);
    setEditorOpen(true);
  };

  const handleSavePlan = async (plan: WorkoutPlanInput): Promise<boolean> => {
    if (!plan.name.trim()) {
      Alert.alert("Missing name", "Give this plan a name before saving.");
      return false;
    }
    if (plan.sections.length === 0) {
      Alert.alert("Add a set", "Your plan needs at least one set.");
      return false;
    }
    if (plan.sections.some((section) => section.exercises.length === 0)) {
      Alert.alert("Check sets", "Every set needs at least one exercise.");
      return false;
    }
    if (plan.sections.some((section) => section.exercises.some((exercise) => !exercise.name.trim()))) {
      Alert.alert("Check exercises", "Every exercise needs a name.");
      return false;
    }

    await savePlan(plan);
    setEditorOpen(false);
    setEditingPlan(null);
    const nextData = await refreshData();
    await syncWorkoutReminderDelivery(
      settings,
      getScheduledWorkoutDays(nextData.plans, settings.workoutDays)
    ).catch(() => undefined);
    return true;
  };

  const handleDeletePlan = (plan: WorkoutPlan) => {
    Alert.alert("Delete plan", `Delete "${plan.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deletePlan(plan.id);
          const nextData = await refreshData();
          await syncWorkoutReminderDelivery(
            settings,
            getScheduledWorkoutDays(nextData.plans, settings.workoutDays)
          ).catch(() => undefined);
        }
      }
    ]);
  };

  const previewSharedPlan = useCallback(
    (sharedPlan: WorkoutPlanInput) => {
      const exerciseCount = sharedPlan.sections.reduce(
        (total, section) => total + section.exercises.length,
        0
      );
      Alert.alert(
        "Add to My Plans?",
        `“${sharedPlan.name}” has ${sharedPlan.sections.length} set(s) and ${exerciseCount} exercise(s).`,
        [
          { text: "Not Now", style: "cancel" },
          {
            text: "Add to My Plans",
            onPress: () => {
              void (async () => {
                try {
                  await savePlan(sharedPlan);
                  const nextData = await refreshData();
                  await syncWorkoutReminderDelivery(
                    settings,
                    getScheduledWorkoutDays(nextData.plans, settings.workoutDays)
                  ).catch(() => undefined);
                  setActiveModule("workout");
                  setPlanListMode("all");
                  setActiveTab("plans");
                  setShowSplashOverlay(false);
                  if (Platform.OS === "android") {
                    ToastAndroid.show(`Added ${sharedPlan.name} to your plans`, ToastAndroid.SHORT);
                  } else {
                    Alert.alert("Plan added", `“${sharedPlan.name}” is now in your plans.`);
                  }
                } catch (error) {
                  const message = error instanceof Error ? error.message : "The plan could not be saved.";
                  Alert.alert("Could not add plan", message);
                }
              })();
            }
          }
        ]
      );
    },
    [refreshData, settings]
  );

  const handleSharePlan = async (plan: WorkoutPlan) => {
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        await Share.share(
          { message: createPlanShareMessage(plan), title: `Share ${plan.name}` },
          { dialogTitle: `Share ${plan.name}` }
        );
        return;
      }

      const fileStem = plan.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "workout";
      const uri = `${FileSystem.cacheDirectory}anthra-plan-${fileStem}.json`;
      await FileSystem.writeAsStringAsync(uri, createPlanShareFileContents(plan), {
        encoding: FileSystem.EncodingType.UTF8
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: `Share ${plan.name}`,
        UTI: "public.json"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "This plan could not be shared.";
      Alert.alert("Could not share plan", message);
    }
  };

  const previewSharedPlanText = useCallback(
    (text: string) => {
      const sharedPlan = parsePlanShareText(text);
      if (!sharedPlan) {
        Alert.alert("Invalid shared plan", "Choose an Anthra plan file or copy a complete Anthra plan link.");
        return;
      }
      previewSharedPlan(sharedPlan);
    },
    [previewSharedPlan]
  );

  const handleImportPlanFile = useCallback(async () => {
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain"],
        copyToCacheDirectory: true,
        multiple: false
      });
      if (selection.canceled || !selection.assets[0]) return;
      const raw = await FileSystem.readAsStringAsync(selection.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (raw.length > 1_000_000) throw new Error("This plan file is too large to import safely.");
      previewSharedPlanText(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "This plan file could not be read.";
      Alert.alert("Could not import plan", message);
    }
  }, [previewSharedPlanText]);

  const handleImportPlan = useCallback(() => {
    Alert.alert(
      "Import a plan",
      "Choose a shared Anthra plan file, or paste a plan link copied from a message.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Paste shared link",
          onPress: () => {
            Clipboard.getStringAsync()
              .then(previewSharedPlanText)
              .catch(() => Alert.alert("Clipboard unavailable", "Anthra could not read the clipboard."));
          }
        },
        {
          text: "Choose file",
          onPress: () => handleImportPlanFile().catch(() => undefined)
        }
      ]
    );
  }, [handleImportPlanFile, previewSharedPlanText]);

  const handleIncomingPlanUrl = useCallback(
    (url: string) => {
      if (!isPlanShareUrl(url) || handledPlanShareUrlsRef.current.has(url)) return;
      handledPlanShareUrlsRef.current.add(url);

      const sharedPlan = parsePlanShareUrl(url);
      if (!sharedPlan) {
        Alert.alert("Invalid shared plan", "This Anthra plan link is incomplete or no longer supported.");
        return;
      }
      previewSharedPlan(sharedPlan);
    },
    [previewSharedPlan]
  );

  useEffect(() => {
    if (!ready) return;

    Linking.getInitialURL()
      .then((url) => {
        if (url) handleIncomingPlanUrl(url);
      })
      .catch(() => undefined);

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleIncomingPlanUrl(url);
    });
    return () => subscription.remove();
  }, [handleIncomingPlanUrl, ready]);

  const handleDeleteHistoryEntry = (entry: WorkoutHistoryEntry) => {
    Alert.alert("Delete history", `Remove "${entry.planName}" from workout history?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteWorkoutSession(entry.id);
          await refreshHistory();
        }
      }
    ]);
  };

  const clearWorkoutRecovery = useCallback(async () => {
    if (workoutSnapshotSaveRef.current) {
      clearTimeout(workoutSnapshotSaveRef.current);
      workoutSnapshotSaveRef.current = null;
    }
    await clearActiveWorkoutSnapshot();
    setRecoverableWorkout(null);
  }, []);

  const handleTimerStateChange = useCallback(
    (timer: WorkoutTimerState) => {
      if (!activePlan || !activeSessionId) return;
      if (workoutSnapshotSaveRef.current) {
        clearTimeout(workoutSnapshotSaveRef.current);
      }

      const snapshot: ActiveWorkoutSnapshot = {
        sessionId: activeSessionId,
        plan: activePlan,
        timer,
        updatedAt: Date.now()
      };
      workoutSnapshotSaveRef.current = setTimeout(() => {
        workoutSnapshotSaveRef.current = null;
        saveActiveWorkoutSnapshot(snapshot).catch(() => undefined);
      }, 500);
    },
    [activePlan, activeSessionId]
  );

  const resumeInterruptedWorkout = useCallback(() => {
    if (!recoverableWorkout) return;
    completionLoggedRef.current = false;
    setActiveTimerInitialState({ ...recoverableWorkout.timer, isRunning: false });
    setActiveSessionId(recoverableWorkout.sessionId);
    setActivePlan(recoverableWorkout.plan);
    setRecoverableWorkout(null);
    setActiveModule("workout");
  }, [recoverableWorkout]);

  const endInterruptedWorkout = useCallback(() => {
    if (!recoverableWorkout) return;
    Alert.alert(
      "End interrupted workout?",
      "Your progress will stay in workout history as a partial session.",
      [
        { text: "Keep It", style: "cancel" },
        {
          text: "End Workout",
          style: "destructive",
          onPress: async () => {
            await finalizeWorkoutSession(recoverableWorkout.sessionId, {
              ...recoverableWorkout.timer.summary,
              completed: false
            });
            await clearWorkoutRecovery();
            await refreshData();
          }
        }
      ]
    );
  }, [clearWorkoutRecovery, recoverableWorkout, refreshData]);

  const handleStartPlan = async (plan: WorkoutPlan) => {
    if (recoverableWorkout) {
      Alert.alert(
        "Workout waiting to resume",
        `Resume or end “${recoverableWorkout.plan.name}” from the Anthra hub before starting another workout.`,
        [{ text: "Go to Hub", onPress: () => setActiveModule("hub") }]
      );
      return;
    }

    try {
      const startedAt = Date.now();
      const sessionId = await startWorkoutSession(plan.id, plan.name);
      const initialTimer: WorkoutTimerState = {
        phase: "ready",
        segmentIndex: 0,
        remainingSeconds: 5,
        isRunning: true,
        startedAt,
        summary: {
          completed: false,
          progressPercent: 0,
          completedSegments: 0,
          totalSegments: 0,
          elapsedSeconds: 0
        }
      };
      await saveActiveWorkoutSnapshot({ sessionId, plan, timer: initialTimer, updatedAt: Date.now() });
      completionLoggedRef.current = false;
      setActiveTimerInitialState(null);
      setActiveSessionId(sessionId);
      setActivePlan(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start workout.";
      Alert.alert("Session error", message);
    }
  };

  const finalizeCurrentSession = useCallback(
    async (summary: WorkoutRunSummary) => {
      if (!activePlan || !activeSessionId) return;

      await finalizeWorkoutSession(activeSessionId, summary);
      if (summary.completed && !completionLoggedRef.current) {
        completionLoggedRef.current = true;
        await logWorkoutCompletion(activePlan.id);
      }
    },
    [activePlan, activeSessionId]
  );

  const handleWorkoutComplete = async (summary: WorkoutRunSummary) => {
    await finalizeCurrentSession({ ...summary, completed: true, progressPercent: 100 });
    await clearWorkoutRecovery();
    await refreshDashboard();
    await refreshHistory();
  };

  const openSessionFeedback = useCallback((sessionId: number, planName: string) => {
    setFeedbackSessionId(sessionId);
    setFeedbackPlanName(planName);
    setFeedbackRating(0);
    setFeedbackComment("");
    setFeedbackNoteModalOpen(false);
    setFeedbackOpen(true);
  }, []);

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackSessionId) return;
    if (feedbackRating < 1 || feedbackRating > 5) {
      Alert.alert("Pick a rating", "Rate this session from 1 to 5 stars.");
      return;
    }

    setFeedbackSaving(true);
    try {
      await saveWorkoutSessionFeedback(feedbackSessionId, feedbackRating, feedbackComment);
      setFeedbackOpen(false);
      await refreshHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save feedback.";
      Alert.alert("Feedback error", message);
    } finally {
      setFeedbackSaving(false);
    }
  }, [feedbackComment, feedbackRating, feedbackSessionId, refreshHistory]);

  const handleShare = async () => {
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

  const handleSaveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    setProfileNotice(null);
    try {
      const heightRaw = profileHeightCm.trim();
      const weightRaw = profileWeightKg.trim();
      const heightValue = heightRaw.length === 0 ? null : parsePositiveNumber(heightRaw);
      const weightValue = weightRaw.length === 0 ? null : parsePositiveNumber(weightRaw);

      if (heightRaw.length > 0 && heightValue == null) {
        setProfileNotice({
          type: "error",
          message: "Height must be a valid number in cm (example: 170)."
        });
        return;
      }
      if (weightRaw.length > 0 && weightValue == null) {
        setProfileNotice({
          type: "error",
          message: "Weight must be a valid number in kg (example: 70)."
        });
        return;
      }
      if (heightValue != null && (heightValue < 50 || heightValue > 300)) {
        setProfileNotice({
          type: "error",
          message: "Height must be between 50 and 300 cm."
        });
        return;
      }
      if (weightValue != null && (weightValue < 20 || weightValue > 500)) {
        setProfileNotice({
          type: "error",
          message: "Weight must be between 20 and 500 kg."
        });
        return;
      }

      const payload: UserProfile = {
        heightCm: heightValue,
        weightKg: weightValue,
        goal: profileGoal.trim()
      };
      await saveUserProfile(payload);
      await refreshProfile();
      setProfileNotice({
        type: "success",
        message: "Profile updated."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save profile.";
      setProfileNotice({
        type: "error",
        message
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfileHeightChange = (value: string) => {
    if (profileNotice) setProfileNotice(null);
    setProfileHeightCm(value);
  };

  const handleProfileWeightChange = (value: string) => {
    if (profileNotice) setProfileNotice(null);
    setProfileWeightKg(value);
  };

  const handleProfileGoalChange = (value: string) => {
    if (profileNotice) setProfileNotice(null);
    setProfileGoal(value);
  };

  const toggleGlobalWorkoutDay = (day: number) => {
    if (settingsNotice) setSettingsNotice(null);
    setSettings((prev) => {
      if (prev.workoutDays.includes(day)) {
        return { ...prev, workoutDays: prev.workoutDays.filter((value) => value !== day) };
      }
      return { ...prev, workoutDays: normalizeDays([...prev.workoutDays, day]) };
    });
  };

  const updateReminderLeadText = useCallback((index: number, value: string) => {
    if (settingsNotice) setSettingsNotice(null);
    setReminderLeadTexts((prev) => {
      const next = [...prev];
      next[index] = digitsOnly(value);
      return next;
    });
  }, [settingsNotice]);

  const handleSaveSettings = async () => {
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsNotice(null);
    try {
      const weeklyGoal = parseStrictWholeNumber(weeklyGoalText);
      if (weeklyGoal == null || weeklyGoal < 1 || weeklyGoal > 7) {
        setSettingsNotice({
          type: "error",
          message: "Weekly streak goal must be a whole number between 1 and 7."
        });
        return;
      }

      const reminderHour = parseStrictWholeNumber(reminderHourText);
      if (reminderHour == null || reminderHour < 0 || reminderHour > 23) {
        setSettingsNotice({
          type: "error",
          message: "Reminder hour must be between 0 and 23."
        });
        return;
      }

      const reminderMinute = parseStrictWholeNumber(reminderMinuteText);
      if (reminderMinute == null || reminderMinute < 0 || reminderMinute > 59) {
        setSettingsNotice({
          type: "error",
          message: "Reminder minute must be between 0 and 59."
        });
        return;
      }

      const parsedLeadMinutes: number[] = [];
      for (let index = 0; index < reminderCount; index += 1) {
        const rawLead = reminderLeadTexts[index] ?? "";
        const leadValue = parseStrictWholeNumber(rawLead);
        if (leadValue == null || leadValue < 0 || leadValue > 720) {
          setSettingsNotice({
            type: "error",
            message: `Reminder ${index + 1} lead time must be between 0 and 720 minutes.`
          });
          return;
        }
        parsedLeadMinutes.push(leadValue);
      }

      const reminderLeadMinutes = normalizeReminderLeadMinutes(parsedLeadMinutes);
      const effectiveLeadMinutes = reminderLeadMinutes.length > 0 ? reminderLeadMinutes : [60];

      const payload: UserSettings = {
        workoutDays: normalizeDays(settings.workoutDays),
        weeklyGoal,
        reminderHour,
        reminderMinute,
        reminderLeadMinutes: effectiveLeadMinutes,
        notificationsEnabled: settings.notificationsEnabled,
        reminderDelivery: settings.reminderDelivery,
        timezone: settings.timezone || getDeviceTimeZone()
      };

      await saveUserSettings(payload);
      setSettings(payload);
      setWeeklyGoalText(String(payload.weeklyGoal));
      setReminderHourText(String(payload.reminderHour));
      setReminderMinuteText(String(payload.reminderMinute));
      setReminderLeadTexts(ensureThreeLeadInputs(payload.reminderLeadMinutes));
      setReminderCount(Math.min(3, Math.max(1, payload.reminderLeadMinutes.length)));
      await refreshDashboard();

      if (
        Platform.OS === "android" &&
        payload.notificationsEnabled &&
        (payload.reminderDelivery === "alarm" || payload.reminderDelivery === "both")
      ) {
        if (Number(Platform.Version) >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }
        await promptForWorkoutAlarmPermission();
      }

      const reminderResult = await syncWorkoutReminderDelivery(
        payload,
        getScheduledWorkoutDays(plans, payload.workoutDays)
      );
      const reminderFailure =
        !reminderResult.supported ||
        /(?:reminder|alarm) sync failed|allow notifications|require(?:s)? an android|unavailable|not available/i.test(
          reminderResult.message
        );
      setSettingsNotice({
        type: reminderFailure ? "error" : "success",
        message: reminderResult.message ?? "Settings updated."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save settings.";
      setSettingsNotice({
        type: "error",
        message
      });
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setSettingsNotice(null);
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        throw new Error("Sharing is not available on this device.");
      }
      const backup = await createAnthraBackup();
      const dateLabel = new Date().toISOString().slice(0, 10);
      const uri = `${FileSystem.cacheDirectory}anthra-backup-${dateLabel}.json`;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(backup, null, 2), {
        encoding: FileSystem.EncodingType.UTF8
      });
      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Save Anthra backup",
        UTI: "public.json"
      });
      setSettingsNotice({ type: "success", message: "Backup created. Password Buddy secrets were not included." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create backup.";
      setSettingsNotice({ type: "error", message });
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    if (backupBusy) return;
    setSettingsNotice(null);
    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
        multiple: false
      });
      if (selection.canceled || !selection.assets[0]) return;
      const raw = await FileSystem.readAsStringAsync(selection.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8
      });
      if (raw.length > 15_000_000) throw new Error("Backup is too large to restore safely.");
      const parsed: unknown = JSON.parse(raw);

      Alert.alert(
        "Restore this backup?",
        "Workouts, alarms, reminders, lists, profile, and settings on this device will be replaced. Password Buddy stays unchanged.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: () => {
              const restore = async () => {
                setBackupBusy(true);
                try {
                  await restoreAnthraBackup(parsed);
                  await replaceNativeAlarms(await getAlarmItems()).catch(() => undefined);
                  setRecoverableWorkout(null);
                  const [nextData, nextSettings, nextReminders, nextCompletions, , restoredThemeMode] = await Promise.all([
                    refreshData(),
                    refreshSettings(),
                    refreshReminderItems(),
                    refreshReminderCompletions(),
                    refreshProfile(),
                    getAppThemeMode()
                  ]);
                  setThemeMode(restoredThemeMode);
                  await syncAllNotifications(nextSettings, nextData.plans, nextReminders, nextCompletions, true);
                  setSettingsNotice({ type: "success", message: "Backup restored successfully." });
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Could not restore backup.";
                  setSettingsNotice({ type: "error", message });
                } finally {
                  setBackupBusy(false);
                }
              };
              restore().catch(() => undefined);
            }
          }
        ]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not read backup.";
      setSettingsNotice({ type: "error", message });
    }
  };

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

  const clearRevealTimeout = (entryId: number) => {
    const existing = revealTimeoutsRef.current[entryId];
    if (existing) {
      clearTimeout(existing);
      delete revealTimeoutsRef.current[entryId];
    }
  };

  const scheduleRevealAutoHide = (entryId: number) => {
    clearRevealTimeout(entryId);
    revealTimeoutsRef.current[entryId] = setTimeout(() => {
      setRevealedVaultIds((prev) => prev.filter((id) => id !== entryId));
      clearRevealTimeout(entryId);
    }, 10_000);
  };

  const copyVaultPassword = async (entryId: number) => {
    const entry = vaultEntries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      throw new Error("That password is no longer available.");
    }

    await clearCopiedVaultPassword();
    await Clipboard.setStringAsync(entry.secret);
    vaultClipboardValueRef.current = entry.secret;
    vaultClipboardClearTimeoutRef.current = setTimeout(() => {
      clearCopiedVaultPassword().catch(() => undefined);
    }, 30_000);
    setVaultNotice({ type: "success", message: "Password copied. Clipboard clears in 30 seconds." });
  };

  const requestVaultSensitiveAction = async (mode: "reveal" | "copy", entryId: number) => {
    if (vaultBiometricActionInProgressRef.current) return;
    if (!vaultBiometricsEnabled) {
      openPinModal(mode, entryId);
      return;
    }

    vaultBiometricActionInProgressRef.current = true;
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync()
      ]);
      if (!hasHardware || !isEnrolled) {
        openPinModal(mode, entryId);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: mode === "reveal" ? "Show password" : "Copy password",
        cancelLabel: "Use PIN",
        fallbackLabel: "Use PIN",
        disableDeviceFallback: true
      }).catch(() => null);

      if (!result?.success) {
        openPinModal(mode, entryId);
        return;
      }

      vaultPinAttemptRef.current = registerVaultPinSuccess();
      try {
        if (mode === "reveal") {
          setRevealedVaultIds((prev) => (prev.includes(entryId) ? prev : [...prev, entryId]));
          scheduleRevealAutoHide(entryId);
        } else {
          await copyVaultPassword(entryId);
        }
      } catch (error) {
        setVaultNotice({
          type: "error",
          message: error instanceof Error ? error.message : "Could not complete that password action."
        });
      }
    } catch {
      openPinModal(mode, entryId);
    } finally {
      vaultBiometricActionInProgressRef.current = false;
    }
  };

  const openPinModal = (mode: "unlock" | "reveal" | "copy", entryId: number | null = null) => {
    pinVerificationRequestRef.current += 1;
    const attemptStatus = getVaultPinAttemptStatus(vaultPinAttemptRef.current, Date.now());
    setPinModalMode(mode);
    setPinModalTargetEntryId(entryId);
    setPinModalInput("");
    setPinModalError(
      attemptStatus.canAttempt
        ? ""
        : `Too many incorrect attempts. Try again in ${attemptStatus.remainingWaitSeconds} seconds.`
    );
    setPinVerifying(false);
    setPinModalOpen(true);
  };

  const closePinModal = () => {
    cancelPinVerification();
    setPinModalInput("");
    setPinModalError("");
    setPinVerifying(false);
    setPinModalTargetEntryId(null);
  };

  const verifyPinModal = async () => {
    if (pinVerifying) return;
    const now = Date.now();
    const attemptStatus = getVaultPinAttemptStatus(vaultPinAttemptRef.current, now);
    if (!attemptStatus.canAttempt) {
      setPinModalError(
        `Too many incorrect attempts. Try again in ${attemptStatus.remainingWaitSeconds} seconds.`
      );
      return;
    }

    const requestId = ++pinVerificationRequestRef.current;
    const requestedMode = pinModalMode;
    const requestedEntryId = pinModalTargetEntryId;
    const requestedPin = pinModalInput;
    const requestIsCurrent = () => pinVerificationRequestRef.current === requestId;

    setPinVerifying(true);
    try {
      const valid = await verifyVaultPin(requestedPin);
      if (!requestIsCurrent()) return;
      if (!valid) {
        const nextAttemptState = registerVaultPinFailure(vaultPinAttemptRef.current, Date.now());
        vaultPinAttemptRef.current = nextAttemptState;
        const nextStatus = getVaultPinAttemptStatus(nextAttemptState, Date.now());
        setPinModalError(
          nextStatus.canAttempt
            ? "Incorrect PIN."
            : `Incorrect PIN. Try again in ${nextStatus.remainingWaitSeconds} seconds.`
        );
        return;
      }

      vaultPinAttemptRef.current = registerVaultPinSuccess();

      if (requestedMode === "unlock") {
        const entries = await getVaultEntries();
        if (!requestIsCurrent()) return;
        setVaultEntries(entries);
        setVaultUnlocked(true);
      } else if (requestedMode === "reveal" && requestedEntryId != null) {
        setRevealedVaultIds((prev) =>
          prev.includes(requestedEntryId) ? prev : [...prev, requestedEntryId]
        );
        scheduleRevealAutoHide(requestedEntryId);
      } else if (requestedMode === "copy" && requestedEntryId != null) {
        await copyVaultPassword(requestedEntryId);
        if (!requestIsCurrent()) {
          await clearCopiedVaultPassword();
          setVaultNotice(null);
          return;
        }
      }
      closePinModal();
    } catch (error) {
      if (!requestIsCurrent()) return;
      const message = error instanceof Error ? error.message : "Could not verify PIN.";
      setPinModalError(message);
    } finally {
      if (requestIsCurrent()) setPinVerifying(false);
    }
  };

  const enterPasswordManager = async () => {
    const security = await refreshVaultSecurity();
    setActiveModule("password");
    if (security.hasPin) {
      if (security.biometricsEnabled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock Password Buddy",
          cancelLabel: "Use PIN",
          fallbackLabel: "Use PIN",
          disableDeviceFallback: true
        }).catch(() => null);
        if (result?.success) {
          vaultPinAttemptRef.current = registerVaultPinSuccess();
          await refreshVaultEntries();
          setVaultUnlocked(true);
          return;
        }
      }
      openPinModal("unlock");
    } else {
      setVaultUnlocked(false);
    }
  };

  const handleSetupVaultPin = async () => {
    try {
      const pin = digitsOnly(vaultNewPin);
      const confirmPin = digitsOnly(vaultConfirmPin);
      if (pin.length < 4 || pin.length > 8) {
        setVaultNotice({ type: "error", message: "PIN must be 4 to 8 digits." });
        return;
      }
      if (pin !== confirmPin) {
        setVaultNotice({ type: "error", message: "PINs do not match." });
        return;
      }
      await saveVaultPin(pin);
      vaultPinAttemptRef.current = registerVaultPinSuccess();
      setVaultNewPin("");
      setVaultConfirmPin("");
      await refreshVaultSecurity();
      setVaultNotice({ type: "success", message: "PIN setup complete." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save PIN.";
      setVaultNotice({ type: "error", message });
    }
  };

  const handleToggleVaultBiometrics = async () => {
    try {
      const enabling = !vaultBiometricsEnabled;
      if (enabling) {
        const [hasHardware, isEnrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync()
        ]);
        if (!hasHardware || !isEnrolled) {
          setVaultNotice({
            type: "error",
            message: "Set up fingerprint or face unlock in your device settings first."
          });
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Enable biometric unlock",
          cancelLabel: "Cancel",
          disableDeviceFallback: true
        });
        if (!result.success) {
          setVaultNotice({ type: "error", message: "Biometric unlock was not enabled." });
          return;
        }
      }

      await saveVaultBiometricsEnabled(enabling);
      await refreshVaultSecurity();
      setVaultNotice({
        type: "success",
        message: enabling ? "Biometric unlock enabled." : "Biometric unlock disabled."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update biometric setting.";
      setVaultNotice({ type: "error", message });
    }
  };

  const openVaultResetPin = () => {
    if (!vaultHasPin || !vaultUnlocked) return;
    setVaultCurrentPin("");
    setVaultReplacementPin("");
    setVaultReplacementPinConfirm("");
    setVaultResetPinError("");
    setVaultResetPinOpen(true);
  };

  const closeVaultResetPin = () => {
    if (vaultResetPinSaving) return;
    setVaultResetPinOpen(false);
    setVaultCurrentPin("");
    setVaultReplacementPin("");
    setVaultReplacementPinConfirm("");
    setVaultResetPinError("");
  };

  const handleResetVaultPin = async () => {
    if (vaultResetPinSaving || !vaultHasPin || !vaultUnlocked) return;

    const currentPin = digitsOnly(vaultCurrentPin);
    const nextPin = digitsOnly(vaultReplacementPin);
    const confirmPin = digitsOnly(vaultReplacementPinConfirm);

    if (currentPin.length < 4 || currentPin.length > 8) {
      setVaultResetPinError("Enter your current 4 to 8 digit PIN.");
      return;
    }
    if (nextPin.length < 4 || nextPin.length > 8) {
      setVaultResetPinError("New PIN must be 4 to 8 digits.");
      return;
    }
    if (nextPin !== confirmPin) {
      setVaultResetPinError("New PINs do not match.");
      return;
    }
    if (nextPin === currentPin) {
      setVaultResetPinError("Choose a new PIN that is different from your current PIN.");
      return;
    }

    setVaultResetPinSaving(true);
    setVaultResetPinError("");
    try {
      await saveVaultPin(nextPin, currentPin);
      vaultPinAttemptRef.current = registerVaultPinSuccess();
      setVaultResetPinOpen(false);
      setVaultCurrentPin("");
      setVaultReplacementPin("");
      setVaultReplacementPinConfirm("");
      setVaultEntries([]);
      setRevealedVaultIds([]);
      setVaultUnlocked(false);
      setVaultNotice({ type: "success", message: "Vault PIN reset. Unlock again with your new PIN." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not reset vault PIN.";
      setVaultResetPinError(message);
    } finally {
      setVaultResetPinSaving(false);
    }
  };

  const openVaultEditor = (entry?: VaultEntry) => {
    setVaultEditorError("");
    setVaultSaving(false);
    if (!entry) {
      setVaultForm(INITIAL_VAULT_FORM);
      setVaultEditorOpen(true);
      return;
    }
    setVaultForm({
      id: entry.id,
      appName: entry.appName,
      accountId: entry.accountId,
      secret: entry.secret
    });
    setVaultEditorOpen(true);
  };

  const handleSaveVault = async () => {
    if (vaultSaving) return;
    setVaultSaving(true);
    setVaultEditorError("");
    try {
      await saveVaultEntry(vaultForm);
      await refreshVaultEntries();
      setVaultEditorOpen(false);
      setVaultForm(INITIAL_VAULT_FORM);
      setVaultNotice({ type: "success", message: "Password saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save password.";
      setVaultEditorError(message);
    } finally {
      setVaultSaving(false);
    }
  };

  const handleDeleteVault = (entry: VaultEntry) => {
    Alert.alert("Delete password", `Delete credentials for ${entry.appName}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            clearRevealTimeout(entry.id);
            await deleteVaultEntry(entry.id);
            await refreshVaultEntries();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not delete password.";
            setVaultNotice({ type: "error", message });
          }
        }
      }
    ]);
  };

  const handleToggleShowPassword = (entryId: number, currentlyVisible: boolean) => {
    if (currentlyVisible) {
      clearRevealTimeout(entryId);
      setRevealedVaultIds((prev) => prev.filter((id) => id !== entryId));
      return;
    }
    requestVaultSensitiveAction("reveal", entryId).catch(() => undefined);
  };

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
    settings.reminderHour,
    settings.reminderMinute,
    settings.reminderLeadMinutes,
    settings.timezone
  ]);

  const closeTimer = async (summary: WorkoutRunSummary) => {
    const finishedSessionId = activeSessionId;
    const finishedPlanName = activePlan?.name ?? "Workout";
    setWorkoutCompletionTransition(true);
    try {
      await finalizeCurrentSession(summary);
    } finally {
      try {
        await clearWorkoutRecovery();
        setActivePlan(null);
        setActiveSessionId(null);
        setActiveTimerInitialState(null);
        await refreshData();
        if (summary.completed && finishedSessionId) {
          openSessionFeedback(finishedSessionId, finishedPlanName);
        }
      } finally {
        setWorkoutCompletionTransition(false);
      }
    }
  };

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      if (activePlan) {
        // TimerScreen owns workout exit confirmation and handles this event next.
        return false;
      }
      if (feedbackNoteModalOpen) {
        setFeedbackNoteModalOpen(false);
        return true;
      }
      if (feedbackOpen) {
        if (!feedbackSaving) setFeedbackOpen(false);
        return true;
      }
      if (reminderEditorOpen) {
        if (!reminderSaving) setReminderEditorOpen(false);
        return true;
      }
      if (vaultResetPinOpen) {
        closeVaultResetPin();
        return true;
      }
      if (vaultEditorOpen) {
        setVaultEditorOpen(false);
        return true;
      }
      if (pinModalOpen) {
        if (!pinVerifying) closePinModal();
        return true;
      }
      if (editorOpen) {
        setEditorOpen(false);
        setEditingPlan(null);
        return true;
      }
      if (activeModule === "workout" && activeTab !== "home") {
        setActiveTab("home");
        return true;
      }
      if (activeModule !== "hub") {
        setActiveModule("hub");
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        return false;
      }
      lastBackPressRef.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [
    activeModule,
    activePlan,
    activeTab,
    editorOpen,
    feedbackNoteModalOpen,
    feedbackOpen,
    feedbackSaving,
    keyboardHeight,
    pinModalOpen,
    pinVerifying,
    reminderEditorOpen,
    reminderSaving,
    vaultEditorOpen,
    vaultResetPinOpen,
    vaultResetPinSaving
  ]);

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
  const keyboardSafeBottomPadding = keyboardHeight > 0 ? keyboardHeight + 16 : 24;
  const semanticTheme = resolveTheme(themeMode, systemColorScheme);
  const isDarkMode = semanticTheme.isDark;
  const statusBarStyle = semanticTheme.statusBarStyle;
  const appBackground = semanticTheme.colors.canvas;
  const panelBackground = semanticTheme.colors.surface;
  const cardBackground = semanticTheme.colors.surfaceElevated;
  const inputBackground = semanticTheme.colors.surfaceSubtle;
  const borderColor = semanticTheme.colors.border;
  const textPrimary = semanticTheme.colors.textPrimary;
  const textMuted = semanticTheme.colors.textSecondary;
  const shouldStackWorkoutActions = windowWidth < 420 || fontScale >= 1.2;
  const shouldStackWorkoutHeaders = windowWidth < 390 || fontScale >= 1.25;
  const shouldStackWorkoutStats = windowWidth < 340 || fontScale >= 1.5;
  const reminderCalendarDaySize = Math.max(
    32,
    Math.min(40, Math.floor((Math.min(windowWidth, 640) - 104) / 7))
  );

  const moduleTheme = useMemo(() => resolveModuleTheme(isDarkMode), [isDarkMode]);
  const workoutTheme = moduleTheme;
  const reminderTheme = moduleTheme;
  const workoutCardStyle = { borderColor, backgroundColor: cardBackground };
  const workoutInputSurfaceStyle = { borderColor: semanticTheme.colors.borderStrong, backgroundColor: inputBackground };

  const heightCm = parsePositiveNumber(profileHeightCm);
  const weightKg = parsePositiveNumber(profileWeightKg);
  const bmi =
    heightCm != null && weightKg != null ? weightKg / Math.pow(Math.max(0.1, heightCm / 100), 2) : null;
  const roundedBmi = bmi != null ? Math.round(bmi * 10) / 10 : null;

  const bmiSummary = useMemo(() => {
    if (roundedBmi == null) {
      return {
        label: "Add your metrics",
        note: "Enter height and weight to calculate BMI.",
        textColor: semanticTheme.colors.textPrimary,
        badgeBackground: semanticTheme.colors.surfaceSubtle,
        badgeTextColor: semanticTheme.colors.textSecondary
      };
    }
    if (roundedBmi < 18.5) {
      return {
        label: "Underweight",
        note: "BMI below 18.5",
        textColor: semanticTheme.colors.warning,
        badgeBackground: semanticTheme.colors.warningSoft,
        badgeTextColor: semanticTheme.colors.warning
      };
    }
    if (roundedBmi < 25) {
      return {
        label: "Healthy Range",
        note: "BMI between 18.5 and 24.9",
        textColor: semanticTheme.colors.success,
        badgeBackground: semanticTheme.colors.successSoft,
        badgeTextColor: semanticTheme.colors.success
      };
    }
    if (roundedBmi < 30) {
      return {
        label: "Overweight",
        note: "BMI between 25 and 29.9",
        textColor: semanticTheme.colors.warning,
        badgeBackground: semanticTheme.colors.warningSoft,
        badgeTextColor: semanticTheme.colors.warning
      };
    }
    return {
      label: "Obesity",
      note: "BMI 30 and above",
      textColor: semanticTheme.colors.danger,
      badgeBackground: semanticTheme.colors.dangerSoft,
      badgeTextColor: semanticTheme.colors.danger
    };
  }, [roundedBmi, semanticTheme.colors]);

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

  const todayWorkoutPlans = todaysPlans;

  const enabledReminderCount = useMemo(
    () => reminderItems.filter((item) => item.enabled).length,
    [reminderItems]
  );

  let content;

  if (!ready) {
    content = (
      <SafeAreaView
        className="flex-1 items-center justify-center px-6"
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: appBackground }}
      >
        <StatusBar style={statusBarStyle} backgroundColor={appBackground} translucent={false} />
        {bootstrapError ? (
          <View
            accessibilityRole="alert"
            className="w-full max-w-[440px] rounded-3xl border p-6"
            style={{ borderColor, backgroundColor: panelBackground }}
          >
            <Text className="text-sm font-black uppercase tracking-[2px]" style={{ color: workoutTheme.accent }}>
              Anthra
            </Text>
            <Text className="mt-3 text-2xl font-black" style={{ color: textPrimary }}>
              We couldn’t finish starting the app
            </Text>
            <Text className="mt-2 text-base leading-6" style={{ color: textMuted }}>
              Your data has not been changed. Retry the startup checks, or restart the app if the problem continues.
            </Text>
            <Text selectable className="mt-3 text-sm" style={{ color: textMuted }}>
              {bootstrapError}
            </Text>
            <Pressable
              onPress={() => setBootstrapAttempt((attempt) => attempt + 1)}
              accessibilityRole="button"
              accessibilityLabel="Retry starting Anthra"
              className="mt-5 min-h-[50px] items-center justify-center rounded-xl px-5"
              style={{ backgroundColor: semanticTheme.colors.brandSolid }}
            >
              <Text className="text-base font-black" style={{ color: semanticTheme.colors.textOnBrandSolid }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator size="large" color={workoutTheme.accent} accessibilityLabel="Starting Anthra" />
        )}
      </SafeAreaView>
    );
  } else if (!activePlan && activeModule === "hub") {
    content = (
      <AnthraHomeScreen
        stats={stats}
        todayWorkoutCount={todayWorkoutPlans.length}
        enabledReminderCount={enabledReminderCount}
        recoverableWorkout={recoverableWorkout}
        onOpenWorkout={() => {
          setActiveModule("workout");
          setPlanListMode("all");
          setActiveTab("home");
        }}
        onChooseTodayWorkout={() => {
          setActiveModule("workout");
          setPlanListMode("today");
          setActiveTab("plans");
        }}
        onOpenActivity={() => setActiveModule("activity")}
        onOpenReminders={() => setActiveModule("reminder")}
        onOpenTracker={() => setActiveModule("tracker")}
        onOpenLists={() => setActiveModule("list")}
        onOpenAlarms={() => setActiveModule("alarm")}
        onOpenVault={() => {
          enterPasswordManager().catch(() => undefined);
        }}
        onOpenProfile={() => {
          setActiveModule("workout");
          setActiveTab("profile");
        }}
        onOpenSettings={() => {
          setActiveModule("workout");
          setActiveTab("settings");
        }}
        onResumeWorkout={resumeInterruptedWorkout}
        onEndWorkout={endInterruptedWorkout}
      />
    );
  } else if (!activePlan && activeModule === "activity") {
    content = (
      <ActivityBuddyScreen
        onBack={() => setActiveModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "tracker") {
    content = (
      <TrackerBuddyScreen
        onBack={() => setActiveModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "alarm") {
    content = (
      <AlarmBuddyScreen
        onBack={() => setActiveModule("hub")}
      />
    );
  } else if (!activePlan && activeModule === "reminder") {
    content = (
      <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} backgroundColor={appBackground} translucent={false} />
        <View
          className="border-b px-5"
          onLayout={(event) => setReminderHeaderBottom(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}
          style={{ borderColor }}
        >
          <ScreenHeader
            eyebrow="ORGANIZE"
            title="Reminders"
            subtitle={`${enabledReminderCount} active · ${deviceTimeZone}`}
            onBack={() => setActiveModule("hub")}
            backLabel="Back to Today"
            action={<Button label="New" size="small" onPress={() => openReminderEditor()} />}
            style={{ width: "100%", maxWidth: semanticTheme.layout.contentMaxWidth, alignSelf: "center" }}
          />
        </View>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            width: "100%",
            maxWidth: semanticTheme.layout.contentMaxWidth,
            alignSelf: "center",
            padding: 20,
            paddingTop: 20,
            paddingBottom: keyboardSafeBottomPadding
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl border p-4" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: reminderTheme.accentSoft }}>
            <Text className="text-base font-semibold" style={{ color: textMuted }}>
              Build one-time events, repeating reminders, multiple daily times, or interval nudges in your device timezone.
            </Text>
          </View>

          <View className="mt-4 rounded-2xl border p-4" style={{ borderColor, backgroundColor: cardBackground }}>
            <View className="flex-row items-start" style={{ gap: semanticTheme.spacing.md }}>
              <View className="min-w-0 flex-1">
                <Text className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: reminderTheme.accent }}>
                  Notifications
                </Text>
                <Text className="mt-1 text-base font-bold" style={{ color: textPrimary }}>
                  {notificationHealthLoading
                    ? "Checking device status…"
                    : notificationHealth?.permission === "granted"
                      ? `${notificationHealth.reminderCount} scheduled`
                      : `Permission: ${notificationHealth?.permission ?? "unknown"}`}
                </Text>
              </View>
              {notificationHealthLoading && <ActivityIndicator size="small" color={reminderTheme.accent} />}
            </View>
            <Text className="mt-3 text-sm font-semibold" style={{ color: textMuted }}>
              {notificationHealth?.nextReminderTriggerAt
                ? `Next: ${formatTimestampInTimeZone(notificationHealth.nextReminderTriggerAt, deviceTimeZone)}`
                : notificationHealth?.supported === false
                  ? "Use a development build to test native notifications."
                  : "No upcoming reminder notification detected."}
            </Text>
            <View
              className="mt-4"
              style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: semanticTheme.spacing.sm }}
            >
              <Button
                label="Send test"
                onPress={() => handleSendTestNotification().catch(() => undefined)}
                variant="secondary"
                size="small"
                style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
              />
              <Button
                label="System settings"
                onPress={() => Linking.openSettings().catch(() => undefined)}
                variant="outline"
                size="small"
                style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
              />
            </View>
            {notificationTestNotice && (
              <Text className="mt-3 text-sm font-semibold" style={{ color: reminderTheme.accent }}>
                {notificationTestNotice}
              </Text>
            )}
          </View>
          {reminderTrackerView === "reminders" && (
            <>
              {reminderItems.length === 0 && (
                <View className="mt-4 rounded-2xl border border-dashed p-5" style={{ borderColor, backgroundColor: cardBackground }}>
                  <Text className="text-base" style={{ color: textMuted }}>No reminders yet.</Text>
                </View>
              )}
              {reminderItems.map((item) => (
                <View key={item.id} className="mt-4 rounded-2xl border p-4" style={{ borderColor, backgroundColor: cardBackground }}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-xl font-bold" style={{ color: textPrimary }}>{item.title}</Text>
                      <Text className="mt-1 text-xs font-black uppercase tracking-[1.2px]" style={{ color: reminderTheme.accent }}>
                        {formatReminderModeLabel(item.mode)}
                      </Text>
                      <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px]" style={{ color: textMuted }}>
                        {formatReminderSchedule(item)}
                      </Text>
                      {item.note.trim().length > 0 && <Text className="mt-2 text-base" style={{ color: textMuted }}>{item.note}</Text>}
                    </View>
                    <View className="items-end" style={{ gap: semanticTheme.spacing.xs }}>
                      <Pressable
                        onPress={() => handleToggleReminder(item).catch(() => undefined)}
                        accessibilityRole="switch"
                        accessibilityLabel={`${item.title} reminder`}
                        accessibilityState={{ checked: item.enabled }}
                        className="min-h-[44px] items-center justify-center rounded-full px-3 py-2"
                        style={{ backgroundColor: item.enabled ? withAlpha(reminderTheme.accent, 0.22) : withAlpha(textPrimary, 0.1) }}
                      >
                        <Text className="text-xs font-black uppercase" style={{ color: item.enabled ? reminderTheme.accent : textMuted }}>
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
                    style={{ marginTop: semanticTheme.spacing.md }}
                  />
                </View>
              ))}
            </>
          )}

          {reminderTrackerView === "history" && (
            <>
              {pendingReminderHistory.length === 0 &&
                doneReminderHistory.length === 0 && (
                  <Card variant="subtle" padding="large" style={{ alignItems: "center", marginTop: semanticTheme.spacing["2xl"] }}>
                    <View style={{ width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.brandSoft }}>
                      <HistoryIcon accessible={false} color={semanticTheme.colors.brand} size={24} />
                    </View>
                    <Text style={[semanticTheme.typography.titleSmall, { color: textPrimary, textAlign: "center", marginTop: semanticTheme.spacing.lg }]}>No reminder activity yet</Text>
                    <Text style={[semanticTheme.typography.body, { color: textMuted, textAlign: "center", marginTop: semanticTheme.spacing.xs }]}>Completed and pending reminder occurrences will appear here.</Text>
                  </Card>
                )}

              {pendingReminderHistory.length > 0 && (
                <View style={{ marginTop: semanticTheme.spacing["2xl"] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: semanticTheme.spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: semanticTheme.spacing.sm }}>
                      <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.warningSoft }}>
                        <Clock3 accessible={false} color={semanticTheme.colors.warning} size={18} />
                      </View>
                      <Text style={[semanticTheme.typography.titleSmall, { color: textPrimary }]}>Pending</Text>
                    </View>
                    <View style={{ minWidth: 28, height: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: semanticTheme.spacing.sm, borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.warningSoft }}>
                      <Text style={[semanticTheme.typography.label, { color: semanticTheme.colors.warning }]}>{pendingReminderHistory.length}</Text>
                    </View>
                  </View>
                  <View style={{ gap: semanticTheme.spacing.md, marginTop: semanticTheme.spacing.md }}>
                    {pendingReminderHistory.map((item) => (
                      <Card key={`pending-${item.reminderId}-${item.occurrenceTs}`} padding="large">
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: semanticTheme.spacing.md }}>
                          <View style={{ width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: semanticTheme.radii.md, backgroundColor: semanticTheme.colors.warningSoft }}>
                            <Clock3 accessible={false} color={semanticTheme.colors.warning} size={20} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} style={[semanticTheme.typography.titleSmall, { color: textPrimary, textAlign: "left" }]}>{item.title}</Text>
                            <Text style={[semanticTheme.typography.caption, { color: semanticTheme.colors.warning, marginTop: semanticTheme.spacing.xs }]}>{formatReminderOccurrenceLabel(item.occurrenceTs, item.timezone)}</Text>
                          </View>
                          <View style={{ paddingHorizontal: semanticTheme.spacing.sm, paddingVertical: semanticTheme.spacing.xs, borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.warningSoft }}>
                            <Text style={[semanticTheme.typography.caption, { color: semanticTheme.colors.warning }]}>PENDING</Text>
                          </View>
                        </View>
                        {item.note.trim().length > 0 && (
                          <View style={{ marginTop: semanticTheme.spacing.md, padding: semanticTheme.spacing.md, borderRadius: semanticTheme.radii.md, backgroundColor: semanticTheme.colors.surfaceSubtle }}>
                            <Text style={[semanticTheme.typography.body, { color: textMuted }]}>{item.note}</Text>
                          </View>
                        )}
                        <Button
                          label="Mark as done"
                          icon={CheckCircle2}
                          onPress={() => handleMarkReminderDone(item).catch(() => undefined)}
                          accessibilityLabel={`Mark ${item.title} done`}
                          fullWidth
                          style={{ marginTop: semanticTheme.spacing.lg }}
                        />
                      </Card>
                    ))}
                  </View>
                </View>
              )}

              {doneReminderHistory.length > 0 && (
                <View style={{ marginTop: semanticTheme.spacing["2xl"] }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: semanticTheme.spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: semanticTheme.spacing.sm }}>
                      <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.successSoft }}>
                        <CheckCircle2 accessible={false} color={semanticTheme.colors.success} size={18} />
                      </View>
                      <Text style={[semanticTheme.typography.titleSmall, { color: textPrimary }]}>Completed</Text>
                    </View>
                    <View style={{ minWidth: 28, height: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: semanticTheme.spacing.sm, borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.successSoft }}>
                      <Text style={[semanticTheme.typography.label, { color: semanticTheme.colors.success }]}>{doneReminderHistory.length}</Text>
                    </View>
                  </View>
                  <View style={{ gap: semanticTheme.spacing.md, marginTop: semanticTheme.spacing.md }}>
                    {doneReminderHistory.map((item) => (
                      <Card key={`done-${item.reminderId}-${item.occurrenceTs}`} padding="large">
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: semanticTheme.spacing.md }}>
                          <View style={{ width: 40, height: 40, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: semanticTheme.radii.md, backgroundColor: semanticTheme.colors.successSoft }}>
                            <CheckCircle2 accessible={false} color={semanticTheme.colors.success} size={20} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text numberOfLines={2} style={[semanticTheme.typography.titleSmall, { color: textPrimary, textAlign: "left" }]}>{item.title}</Text>
                            <Text style={[semanticTheme.typography.caption, { color: semanticTheme.colors.success, marginTop: semanticTheme.spacing.xs }]}>{formatReminderOccurrenceLabel(item.occurrenceTs, item.timezone)}</Text>
                          </View>
                          <View style={{ paddingHorizontal: semanticTheme.spacing.sm, paddingVertical: semanticTheme.spacing.xs, borderRadius: semanticTheme.radii.full, backgroundColor: semanticTheme.colors.successSoft }}>
                            <Text style={[semanticTheme.typography.caption, { color: semanticTheme.colors.success }]}>DONE</Text>
                          </View>
                        </View>
                        {item.note.trim().length > 0 && (
                          <View style={{ marginTop: semanticTheme.spacing.md, padding: semanticTheme.spacing.md, borderRadius: semanticTheme.radii.md, backgroundColor: semanticTheme.colors.surfaceSubtle }}>
                            <Text style={[semanticTheme.typography.body, { color: textMuted }]}>{item.note}</Text>
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
              left: semanticTheme.layout.screenPadding,
              right: semanticTheme.layout.screenPadding,
              top: reminderHeaderBottom + semanticTheme.spacing.md,
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
                shadowColor: semanticTheme.isDark ? "#000000" : reminderNotice.type === "success" ? "#173D2B" : "#5D1B16",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: semanticTheme.isDark ? 0.34 : 0.18,
                shadowRadius: 18,
                elevation: 10
              }}
            />
          </View>
        )}
      </SafeAreaView>
    );
  } else if (!activePlan && activeModule === "password") {
    content = (
      <PasswordManagerScreen
        keyboardBottomPadding={keyboardSafeBottomPadding}
        hasPin={vaultHasPin}
        unlocked={vaultUnlocked}
        newPin={vaultNewPin}
        confirmPin={vaultConfirmPin}
        biometricsEnabled={vaultBiometricsEnabled}
        entries={vaultEntries}
        revealedEntryIds={revealedVaultIds}
        notice={vaultNotice}
        onBack={() => setActiveModule("hub")}
        onChangeNewPin={(value) => setVaultNewPin(digitsOnly(value))}
        onChangeConfirmPin={(value) => setVaultConfirmPin(digitsOnly(value))}
        onSetupPin={() => handleSetupVaultPin().catch(() => undefined)}
        onUnlock={() => openPinModal("unlock")}
        onToggleBiometrics={() => handleToggleVaultBiometrics().catch(() => undefined)}
        onResetPin={openVaultResetPin}
        onAddEntry={() => openVaultEditor()}
        onEditEntry={openVaultEditor}
        onDeleteEntry={handleDeleteVault}
        onToggleEntryVisibility={handleToggleShowPassword}
        onCopyEntryPassword={(entryId) => requestVaultSensitiveAction("copy", entryId).catch(() => undefined)}
      />
    );
  } else if (!activePlan && activeModule === "list") {
    content = (
      <ListBuddyScreen
        onBack={() => {
          setActiveModule("hub");
        }}
      />
    );
  } else if (activePlan) {
    content = (
      <GestureHandlerRootView className="flex-1" style={{ flex: 1 }}>
        <StatusBar style={statusBarStyle} backgroundColor={appBackground} translucent={false} />
        <TimerScreen
          plan={activePlan}
          onComplete={handleWorkoutComplete}
          onBack={closeTimer}
          initialState={activeTimerInitialState}
          onStateChange={handleTimerStateChange}
          accentColor={workoutTheme.accent}
          accentSoftColor={workoutTheme.accentSoft}
        />
      </GestureHandlerRootView>
    );
  } else {
    content = (
      <GestureHandlerRootView className="flex-1" style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} backgroundColor={appBackground} translucent={false} />
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: appBackground }}>
          <View className="border-b px-5" style={{ borderColor }}>
            <ScreenHeader
              eyebrow="MOVE"
              title={tabTitle}
              subtitle={activeTab === "home" ? `${workoutDaysLabel} schedule` : undefined}
              onBack={() => setActiveModule("hub")}
              backLabel="Back to Today"
              style={{ width: "100%", maxWidth: semanticTheme.layout.contentMaxWidth, alignSelf: "center" }}
            />
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              width: "100%",
              maxWidth: semanticTheme.layout.contentMaxWidth,
              alignSelf: "center",
              padding: 20,
              paddingTop: 24,
              paddingBottom: keyboardSafeBottomPadding
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
                      gap: semanticTheme.spacing.sm
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
                    style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: semanticTheme.spacing.md }}
                  >
                    <Button
                      label={quickStartPlan ? "Start workout" : isWorkoutDayToday ? "Choose plan" : "View history"}
                      onPress={() => {
                        if (quickStartPlan) {
                          handleStartPlan(quickStartPlan);
                          return;
                        }
                        if (isWorkoutDayToday) setPlanListMode("all");
                        setActiveTab(isWorkoutDayToday ? "plans" : "history");
                      }}
                      fullWidth
                      size="large"
                      style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                    />
                    <Button
                      label="Manage plans"
                      onPress={() => {
                        setPlanListMode("all");
                        setActiveTab("plans");
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
                  style={{ flexDirection: shouldStackWorkoutStats ? "column" : "row", gap: semanticTheme.spacing.md }}
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
                      gap: semanticTheme.spacing.md
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
                      onPress={handleShare}
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
                      trackColor={semanticTheme.colors.progressTrack}
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
                    gap: semanticTheme.spacing.md
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
                      gap: semanticTheme.spacing.sm
                    }}
                  >
                    {planListMode === "all" && (
                      <Button
                        label="Import"
                        onPress={handleImportPlan}
                        size="small"
                        variant="outline"
                        style={{ flex: shouldStackWorkoutHeaders ? 1 : undefined }}
                      />
                    )}
                    <Button
                      label={planListMode === "today" ? "View all" : "New plan"}
                      onPress={() => {
                        if (planListMode === "today") {
                          setPlanListMode("all");
                          return;
                        }
                        openCreatePlan();
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
                      onPress={() => planListMode === "today" ? setPlanListMode("all") : openCreatePlan()}
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
                          onPress={() => handleDeletePlan(plan)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${plan.name}`}
                          className="ml-3 mt-4 items-center justify-center rounded-2xl px-6"
                          style={{ backgroundColor: semanticTheme.colors.dangerSolid }}
                        >
                          <Text className="font-bold" style={{ color: semanticTheme.colors.textOnDangerSolid }}>Delete</Text>
                        </Pressable>
                      )}
                    >
                      <View className="mt-4 rounded-2xl border p-4" style={workoutCardStyle}>
                        <View className="min-w-0">
                            <Text className="text-lg font-bold" style={{ color: textPrimary }}>{plan.name}</Text>
                            <Text className="mt-1 text-sm" style={{ color: semanticTheme.colors.textTertiary }}>
                              {setCount} {setCount === 1 ? "set" : "sets"} · {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
                            </Text>
                            <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: semanticTheme.colors.textTertiary }}>
                              {formatDays(plan.workoutDays)}
                            </Text>
                        </View>
                        <View className="mt-4 flex-row" style={{ gap: semanticTheme.spacing.sm }}>
                          <Button
                            label="Share"
                            icon={Share2}
                            onPress={() => handleSharePlan(plan)}
                            variant="secondary"
                            size="small"
                            style={{ flex: 1, alignSelf: "stretch" }}
                          />
                          <Button
                            label="Edit"
                            onPress={() => openEditPlan(plan)}
                            variant="outline"
                            size="small"
                            style={{ flex: 1, alignSelf: "stretch" }}
                          />
                        </View>
                        <Button
                          label="Start workout"
                          onPress={() => handleStartPlan(plan)}
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
                    gap: semanticTheme.spacing.xs
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
                        setPlanListMode("all");
                        setActiveTab("plans");
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
                          onPress={() => handleDeleteHistoryEntry(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${entry.planName} workout from history`}
                          className="h-11 w-11 items-center justify-center rounded-full"
                          style={{ backgroundColor: semanticTheme.colors.dangerSoft }}
                        >
                          <Trash2 size={18} color={semanticTheme.colors.danger} />
                        </Pressable>
                        <View
                          className="rounded-lg px-2 py-1"
                          style={{ backgroundColor: entry.completed ? semanticTheme.colors.successSoft : semanticTheme.colors.warningSoft }}
                        >
                          <Text
                            className="text-xs font-black uppercase"
                            style={{ color: entry.completed ? semanticTheme.colors.success : semanticTheme.colors.warning }}
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
                        trackColor={semanticTheme.colors.progressTrack}
                      />
                    </View>

                    <Text className="mt-2 text-xs" style={{ color: semanticTheme.colors.textTertiary }}>
                      {entry.completedSegments}/{entry.totalSegments} segments • {formatDuration(entry.elapsedSeconds)}
                    </Text>

                    {entry.rating != null && (
                      <View className="mt-2 flex-row items-center" style={{ gap: semanticTheme.spacing.xs }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={`${entry.id}-rating-${star}`}
                            accessible={false}
                            size={14}
                            color={semanticTheme.colors.warning}
                            fill={star <= entry.rating! ? semanticTheme.colors.warning : "transparent"}
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
                    style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: semanticTheme.spacing.md }}
                  >
                    <View style={{ flex: shouldStackWorkoutActions ? undefined : 1 }}>
                      <TextField
                        label="Height (cm)"
                        value={profileHeightCm}
                        onChangeText={handleProfileHeightChange}
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
                        onChangeText={handleProfileWeightChange}
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
                      gap: semanticTheme.spacing.sm
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
                    onChangeText={handleProfileGoalChange}
                    multiline
                    textAlignVertical="top"
                    placeholder="Example: Reach 68kg and train 4 days/week."
                    helperText="Keep this specific and achievable; it stays on this device."
                  />
                </View>

                <Button
                  label="Save profile"
                  onPress={handleSaveProfile}
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

                  <View className="mt-4 flex-row flex-wrap" style={{ gap: semanticTheme.spacing.sm }}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const isActive = settings.workoutDays.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          onPress={() => toggleGlobalWorkoutDay(day.value)}
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
                        if (settingsNotice) setSettingsNotice(null);
                        setWeeklyGoalText(digitsOnly(value));
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
                            if (settingsNotice) setSettingsNotice(null);
                            setSettings((current) => ({ ...current, timezone }));
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
                      if (settingsNotice) setSettingsNotice(null);
                      setSettings((prev) => ({
                        ...prev,
                        notificationsEnabled: enabled
                      }));
                    }}
                    style={{ marginTop: semanticTheme.spacing.lg }}
                  />

                  <View className="mt-4">
                    <Text className="mb-2 text-xs font-semibold" style={{ color: semanticTheme.colors.textTertiary }}>
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
                              if (settingsNotice) setSettingsNotice(null);
                              setSettings((current) => ({
                                ...current,
                                reminderDelivery: option.value
                              }));
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
                        if (settingsNotice) setSettingsNotice(null);
                        setReminderHourText(String(hour));
                        setReminderMinuteText(String(minute));
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
                    <Text className="mb-2 text-xs font-semibold" style={{ color: semanticTheme.colors.textTertiary }}>How many reminders?</Text>
                    <View className="flex-row gap-2">
                      {[1, 2, 3].map((count) => {
                        const active = reminderCount === count;
                        return (
                          <Pressable
                            key={count}
                            onPress={() => {
                              if (settingsNotice) setSettingsNotice(null);
                              setReminderCount(count);
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
                          onChangeText={(value) => updateReminderLeadText(index, value)}
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
                  onPress={handleSaveSettings}
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
                    style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: semanticTheme.spacing.md }}
                  >
                    <Button
                      label={backupBusy ? "Working…" : "Export"}
                      onPress={() => handleExportBackup().catch(() => undefined)}
                      disabled={backupBusy}
                      accessibilityLabel="Export Anthra backup"
                      style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                    />
                    <Button
                      label="Restore"
                      onPress={() => handleImportBackup().catch(() => undefined)}
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
              if (tab === "plans") setPlanListMode("all");
              setActiveTab(tab);
            }}
          />
        </SafeAreaView>

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
          onClose={() => {
            setEditorOpen(false);
            setEditingPlan(null);
          }}
          onSave={handleSavePlan}
        />

        <Modal
          visible={feedbackOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!feedbackSaving) setFeedbackOpen(false);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 px-6"
            style={{ backgroundColor: semanticTheme.colors.scrim }}
          >
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}
            >
            <View
              accessibilityViewIsModal
              className="w-full rounded-3xl border p-5"
              style={{ borderColor, backgroundColor: cardBackground, maxWidth: 520, alignSelf: "center" }}
            >
              <Text className="text-xl font-black" style={{ color: textPrimary }}>Rate Session</Text>
              <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                {feedbackPlanName} is complete. Add a quick rating and optional note for your history.
              </Text>

              <View className="mt-4 flex-row justify-between rounded-2xl border px-3 py-3" style={{ borderColor, backgroundColor: inputBackground }}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = feedbackRating >= star;
                  return (
                    <Pressable
                      key={`rating-${star}`}
                      onPress={() => setFeedbackRating(star)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${star} out of 5`}
                      accessibilityState={{ selected: feedbackRating === star }}
                      className="h-11 w-11 items-center justify-center rounded-xl"
                      style={{ backgroundColor: active ? withAlpha(workoutTheme.accent, 0.25) : panelBackground }}
                    >
                      <Star
                        accessible={false}
                        size={23}
                        color={active ? workoutTheme.accent : semanticTheme.colors.textTertiary}
                        fill={active ? workoutTheme.accent : "transparent"}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setFeedbackNoteModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add or edit session note"
                className="mt-4 min-h-[110px] rounded-2xl border px-4 py-3"
                style={{ borderColor: semanticTheme.colors.borderStrong, backgroundColor: inputBackground }}
              >
                <Text className="text-xs font-semibold uppercase tracking-[1.2px]" style={{ color: textMuted }}>
                  Session Note
                </Text>
                <Text
                  className="mt-2 text-sm"
                  style={{ color: feedbackComment.trim() ? textPrimary : semanticTheme.colors.textTertiary }}
                >
                  {feedbackComment.trim() || "Tap to add how this session felt."}
                </Text>
              </Pressable>

              <View className="mt-5 flex-row gap-3">
                <Button
                  label="Later"
                  onPress={() => setFeedbackOpen(false)}
                  disabled={feedbackSaving}
                  variant="outline"
                  fullWidth
                  style={{ flex: 1 }}
                />
                <Button
                  label="Save feedback"
                  onPress={handleSubmitFeedback}
                  loading={feedbackSaving}
                  fullWidth
                  style={{ flex: 1 }}
                />
              </View>
            </View>
            </KeyboardAwareScrollView>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={feedbackNoteModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setFeedbackNoteModalOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 px-6"
            style={{ backgroundColor: semanticTheme.colors.scrim }}
          >
            <KeyboardAwareScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}
            >
            <View
              accessibilityViewIsModal
              className="w-full rounded-3xl border p-5"
              style={{ borderColor, backgroundColor: cardBackground, maxWidth: 520, alignSelf: "center" }}
            >
              <Text className="text-xl font-black" style={{ color: textPrimary }}>Session Note</Text>
              <TextField
                label="How did it feel?"
                value={feedbackComment}
                onChangeText={setFeedbackComment}
                multiline
                autoFocus
                textAlignVertical="top"
                maxLength={400}
                placeholder="Energy, effort, pain, or anything worth remembering"
                helperText={`${feedbackComment.length}/400 characters`}
                containerStyle={{ marginTop: 16 }}
              />
              <View className="mt-5 flex-row gap-3">
                <Button
                  label="Done"
                  onPress={() => setFeedbackNoteModalOpen(false)}
                  variant="outline"
                  fullWidth
                  style={{ flex: 1 }}
                />
                <Button
                  label="Clear note"
                  onPress={() => {
                    setFeedbackComment("");
                    setFeedbackNoteModalOpen(false);
                  }}
                  variant="secondary"
                  fullWidth
                  style={{ flex: 1 }}
                />
              </View>
            </View>
            </KeyboardAwareScrollView>
          </KeyboardAvoidingView>
        </Modal>
      </GestureHandlerRootView>
    );
  }

  return (
    <ThemeProvider mode={themeMode} onModeChange={handleThemeModeChange}>
      <SafeAreaProvider>
        <View className="flex-1" style={{ flex: 1, backgroundColor: appBackground }}>
        {content}
        <Modal
          visible={reminderEditorOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setReminderEditorOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1"
            style={{ backgroundColor: semanticTheme.colors.scrim }}
          >
            <SafeAreaView
              edges={["bottom"]}
              style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 16 }}
            >
            <View
              accessibilityViewIsModal
              className="w-full rounded-3xl border p-5"
              style={{
                borderColor,
                backgroundColor: cardBackground,
                maxWidth: 640,
                maxHeight: "92%",
                alignSelf: "center"
              }}
            >
              <Text accessibilityRole="header" className="text-2xl font-black" style={{ color: textPrimary }}>
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
                <Text className="mb-2 mt-3 text-sm font-semibold" style={{ color: textMuted }}>Reminder Type</Text>
                <View className="flex-row flex-wrap" style={{ gap: semanticTheme.spacing.sm }}>
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
                          borderColor: selected ? reminderTheme.accent : reminderTheme.accentBorder,
                          backgroundColor: selected ? withAlpha(reminderTheme.accent, 0.18) : inputBackground
                        }}
                      >
                        <Text className="text-center text-xs font-black uppercase" style={{ color: selected ? reminderTheme.accent : textMuted }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="mt-2 text-xs" style={{ color: textMuted }}>
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
                        accentColor={reminderTheme.accent}
                        borderColor={reminderTheme.accentBorder}
                        backgroundColor={inputBackground}
                        textColor={textPrimary}
                        mutedColor={textMuted}
                        presets={[
                          { label: "Morning", hour: 8, minute: 0 },
                          { label: "Afternoon", hour: 13, minute: 0 },
                          { label: "Evening", hour: 18, minute: 0 }
                        ]}
                      />
                    </View>
                    {reminderForm.mode === "once" && (
                      <View className="mt-3">
                        <Text className="mb-2 text-sm font-semibold" style={{ color: textMuted }}>Date</Text>
                        <View
                          className="rounded-2xl border p-3"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground }}
                        >
                          <View className="flex-row items-center justify-between">
                            <Pressable
                              onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, -1))}
                              accessibilityRole="button"
                              accessibilityLabel="Previous month"
                              className="min-h-[44px] justify-center rounded-xl border px-3 py-2"
                              style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}
                            >
                              <Text className="text-xs font-black uppercase" style={{ color: textMuted }}>Prev</Text>
                            </Pressable>
                            <Text className="text-base font-black" style={{ color: textPrimary }}>
                              {formatReminderCalendarMonth(reminderCalendarMonth)}
                            </Text>
                            <Pressable
                              onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, 1))}
                              accessibilityRole="button"
                              accessibilityLabel="Next month"
                              className="min-h-[44px] justify-center rounded-xl border px-3 py-2"
                              style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}
                            >
                              <Text className="text-xs font-black uppercase" style={{ color: textMuted }}>Next</Text>
                            </Pressable>
                          </View>
                          <View className="mt-3 flex-row">
                            {WEEKDAY_OPTIONS.map((day) => (
                              <View key={`calendar-head-${day.value}`} className="flex-1 items-center">
                                <Text className="text-xs font-black uppercase" style={{ color: textMuted }}>
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
                                        ? reminderTheme.accent
                                        : day.isToday
                                          ? withAlpha(reminderTheme.accent, 0.65)
                                          : "transparent",
                                      backgroundColor: selected
                                        ? reminderTheme.accent
                                        : day.inMonth
                                          ? panelBackground
                                          : "transparent",
                                      opacity: disabled ? 0.35 : day.inMonth ? 1 : 0.6
                                    }}
                                  >
                                    <Text
                                      className="text-sm font-semibold"
                                      style={{
                                        color: selected
                                          ? reminderTheme.onAccent
                                          : day.inMonth
                                            ? textPrimary
                                            : textMuted
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
                        <Text className="mt-2 text-xs" style={{ color: textMuted }}>
                          Selected: {reminderForm.dateLabel || getDeviceTodayLabel()} in {getDeviceTimeZone()}.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {reminderForm.mode === "multi" && (
                  <View className="mt-3">
                    <Text className="mb-2 text-sm font-semibold" style={{ color: textMuted }}>Times</Text>
                    <View className="gap-3">
                      {reminderForm.timeSlots.map((slot, index) => {
                        if (!slot.trim()) return null;
                        const parsed = parseReminderTimeSlotInput(slot) ?? { hour: 8, minute: 0 };
                        return (
                          <View key={`slot-${index}`} className="rounded-2xl border p-3" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground }}>
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
                              accentColor={reminderTheme.accent}
                              borderColor={reminderTheme.accentBorder}
                              backgroundColor={panelBackground}
                              textColor={textPrimary}
                              mutedColor={textMuted}
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
                                style={{ borderColor: semanticTheme.colors.danger, backgroundColor: semanticTheme.colors.dangerSoft }}
                              >
                                <Text className="text-sm font-black uppercase" style={{ color: semanticTheme.colors.danger }}>Remove</Text>
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
                        style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground }}
                      >
                        <Text className="text-sm font-black uppercase" style={{ color: reminderTheme.accent }}>Add another time</Text>
                      </Pressable>
                    )}
                    <Text className="mt-2 text-xs" style={{ color: textMuted }}>
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
                        accentColor={reminderTheme.accent}
                        borderColor={reminderTheme.accentBorder}
                        backgroundColor={inputBackground}
                        textColor={textPrimary}
                        mutedColor={textMuted}
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
                        accentColor={reminderTheme.accent}
                        borderColor={reminderTheme.accentBorder}
                        backgroundColor={inputBackground}
                        textColor={textPrimary}
                        mutedColor={textMuted}
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
                    <Text className="mb-2 mt-3 text-sm font-semibold" style={{ color: textMuted }}>Days</Text>
                    <View className="flex-row flex-wrap" style={{ gap: semanticTheme.spacing.sm }}>
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
                              borderColor: selected ? reminderTheme.accent : reminderTheme.accentBorder,
                              backgroundColor: selected ? withAlpha(reminderTheme.accent, 0.2) : inputBackground
                            }}
                          >
                            <Text className="text-xs font-bold uppercase" style={{ color: selected ? reminderTheme.accent : textMuted }}>
                              {day.short}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text className="mt-2 text-xs" style={{ color: textMuted }}>
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
                  style={{ marginTop: semanticTheme.spacing.lg }}
                />
              </KeyboardAwareScrollView>
              <View
                className="mt-5"
                style={{ flexDirection: shouldStackWorkoutActions ? "column" : "row", gap: semanticTheme.spacing.md }}
              >
                <Button
                  label="Cancel"
                  onPress={() => {
                    setReminderEditorOpen(false);
                    setReminderEditorError("");
                  }}
                  variant="outline"
                  fullWidth
                  style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                />
                <Button
                  label="Save reminder"
                  onPress={() => handleSaveReminder().catch(() => undefined)}
                  loading={reminderSaving}
                  fullWidth
                  style={{ flex: shouldStackWorkoutActions ? undefined : 1, alignSelf: "stretch" }}
                />
              </View>
            </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Modal>

        <VaultEntryModal
          visible={vaultEditorOpen}
          editing={vaultForm.id != null}
          appName={vaultForm.appName}
          accountId={vaultForm.accountId}
          secret={vaultForm.secret}
          error={vaultEditorError}
          saving={vaultSaving}
          onChangeAppName={(value) => {
            setVaultForm((prev) => ({ ...prev, appName: value }));
            if (vaultEditorError) setVaultEditorError("");
          }}
          onChangeAccountId={(value) => {
            setVaultForm((prev) => ({ ...prev, accountId: value }));
            if (vaultEditorError) setVaultEditorError("");
          }}
          onChangeSecret={(value) => {
            setVaultForm((prev) => ({ ...prev, secret: value }));
            if (vaultEditorError) setVaultEditorError("");
          }}
          onGenerateSecret={async () => {
            const secret = await generateStrongPassword();
            setVaultForm((prev) => ({ ...prev, secret }));
          }}
          onClose={() => {
            setVaultEditorOpen(false);
            setVaultForm(INITIAL_VAULT_FORM);
            setVaultEditorError("");
            setVaultSaving(false);
          }}
          onSave={() => handleSaveVault().catch(() => undefined)}
        />

        <VaultResetPinModal
          visible={vaultResetPinOpen && vaultHasPin && vaultUnlocked}
          currentPin={vaultCurrentPin}
          newPin={vaultReplacementPin}
          confirmPin={vaultReplacementPinConfirm}
          saving={vaultResetPinSaving}
          error={vaultResetPinError}
          onChangeCurrentPin={(value) => {
            setVaultCurrentPin(digitsOnly(value));
            if (vaultResetPinError) setVaultResetPinError("");
          }}
          onChangeNewPin={(value) => {
            setVaultReplacementPin(digitsOnly(value));
            if (vaultResetPinError) setVaultResetPinError("");
          }}
          onChangeConfirmPin={(value) => {
            setVaultReplacementPinConfirm(digitsOnly(value));
            if (vaultResetPinError) setVaultResetPinError("");
          }}
          onClose={closeVaultResetPin}
          onSubmit={() => handleResetVaultPin().catch(() => undefined)}
        />
        <VaultPinModal
          visible={pinModalOpen}
          mode={pinModalMode}
          pin={pinModalInput}
          error={pinModalError}
          verifying={pinVerifying}
          onChangePin={(value) => {
            setPinModalInput(digitsOnly(value));
            if (pinModalError) setPinModalError("");
          }}
          onClose={closePinModal}
          onVerify={() => verifyPinModal().catch(() => undefined)}
        />

        {showSplashOverlay && (
          <LaunchOverlay
            opacity={splashOpacity}
          />
        )}
        </View>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
