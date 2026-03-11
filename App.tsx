import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BellRing, Dumbbell, KeyRound, ListTodo, Trash2 } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import "./global.css";
import { PlanEditorModal } from "./src/components/PlanEditorModal";
import { ProgressBar } from "./src/components/ProgressBar";
import { STREAK_CARD_HEIGHT, STREAK_CARD_WIDTH, StreakCard } from "./src/components/StreakCard";
import { TimerScreen } from "./src/components/TimerScreen";
import { ListBuddyScreen } from "./src/components/ListBuddyScreen";
import {
  deletePlan,
  deleteReminderItem,
  deleteWorkoutSession,
  deleteVaultEntry,
  finalizeWorkoutSession,
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
  saveReminderItem,
  savePlan,
  saveVaultEntry,
  saveVaultPin,
  saveWorkoutSessionFeedback,
  setReminderItemEnabled,
  setVaultBiometricsEnabled as saveVaultBiometricsEnabled,
  saveUserProfile,
  saveUserSettings,
  startWorkoutSession,
  verifyVaultPin
} from "./src/db";
import { WEEKDAY_OPTIONS, formatDays, matchesDay, normalizeDays } from "./src/constants/schedule";
import type {
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
  WorkoutRunSummary
} from "./src/types";
import { syncWorkoutReminders } from "./src/utils/reminders";
import { syncReminderBuddyNotifications } from "./src/utils/reminderBuddy";

type DashboardTab = "home" | "plans" | "history" | "profile" | "settings";
type AppModule = "hub" | "workout" | "reminder" | "password" | "list";
type ThemedModule = Exclude<AppModule, "hub">;
type AppThemePresetId = "mint" | "sky" | "apricot" | "rose" | "lime" | "indigo";
type AppThemeSelections = Record<ThemedModule, AppThemePresetId>;

type AppThemePreset = {
  id: AppThemePresetId;
  label: string;
  accentLight: string;
  accentDark: string;
  softLight: string;
  softDark: string;
};

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

type ReminderTrackerView = "reminders" | "history";

type ReminderHistoryItem = {
  reminderId: number;
  occurrenceTs: number;
  title: string;
  note: string;
  mode: ReminderMode;
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
  streakWeeks: 0,
  weekCompleted: 0,
  weekGoal: 4
};

const INITIAL_SETTINGS: UserSettings = {
  workoutDays: [1, 3, 5],
  weeklyGoal: 4,
  reminderHour: 18,
  reminderMinute: 0,
  reminderLeadMinutes: [60],
  notificationsEnabled: false
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

const APP_THEME_PRESETS: Record<AppThemePresetId, AppThemePreset> = {
  mint: {
    id: "mint",
    label: "Mint",
    accentLight: "#18C79A",
    accentDark: "#5EF2C4",
    softLight: "#D5FFF1",
    softDark: "#14342C"
  },
  sky: {
    id: "sky",
    label: "Sky",
    accentLight: "#00C8F0",
    accentDark: "#75DFFF",
    softLight: "#D7F7FF",
    softDark: "#153847"
  },
  apricot: {
    id: "apricot",
    label: "Apricot",
    accentLight: "#D88A3A",
    accentDark: "#FFBE78",
    softLight: "#FFF0DF",
    softDark: "#38291D"
  },
  rose: {
    id: "rose",
    label: "Rose",
    accentLight: "#D75B87",
    accentDark: "#FFA2C1",
    softLight: "#FFE2EC",
    softDark: "#381E29"
  },
  lime: {
    id: "lime",
    label: "Lime",
    accentLight: "#84B83A",
    accentDark: "#B8E86F",
    softLight: "#EFFADB",
    softDark: "#28321A"
  },
  indigo: {
    id: "indigo",
    label: "Indigo",
    accentLight: "#6B82DA",
    accentDark: "#B2C2FF",
    softLight: "#E4EBFF",
    softDark: "#232A40"
  }
};

const DEFAULT_APP_THEME_SELECTIONS: AppThemeSelections = {
  workout: "sky",
  reminder: "mint",
  password: "rose",
  list: "indigo"
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

function readableTextOn(backgroundHex: string): string {
  const sanitized = backgroundHex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(sanitized)) return "#08202A";
  const parsed = Number.parseInt(sanitized, 16);
  const r = (parsed >> 16) & 255;
  const g = (parsed >> 8) & 255;
  const b = parsed & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#08202A" : "#F6FCFF";
}

function resolveModuleTheme(
  module: ThemedModule,
  selections: AppThemeSelections,
  isDarkMode: boolean
): ModuleTheme {
  const preset = APP_THEME_PRESETS[selections[module]];
  const accent = isDarkMode ? preset.accentDark : preset.accentLight;
  const accentSoft = isDarkMode ? preset.softDark : preset.softLight;
  return {
    accent,
    accentSoft,
    accentBorder: withAlpha(accent, isDarkMode ? 0.45 : 0.34),
    icon: accent,
    onAccent: readableTextOn(accent)
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

const IST_OFFSET_MINUTES = 330;
const REMINDER_HISTORY_PAST_DAYS = 7;

function toIstDayParts(baseMs: number, dayOffset: number): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const shifted = baseMs + IST_OFFSET_MINUTES * 60_000;
  const baseIstDate = new Date(shifted);
  const utcMs = Date.UTC(
    baseIstDate.getUTCFullYear(),
    baseIstDate.getUTCMonth(),
    baseIstDate.getUTCDate() + dayOffset,
    0,
    0,
    0,
    0
  );
  const dayDate = new Date(utcMs);
  return {
    year: dayDate.getUTCFullYear(),
    month: dayDate.getUTCMonth() + 1,
    day: dayDate.getUTCDate(),
    weekday: dayDate.getUTCDay()
  };
}

function istToUtcTimestamp(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MINUTES * 60_000;
}

function formatDateInput(baseDate: Date): string {
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + 1;
  const day = baseDate.getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getIstTodayLabel(): string {
  const shifted = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
  return formatDateInput(shifted);
}

function ensureReminderTimeInputs(values: string[]): string[] {
  return Array.from({ length: 4 }, (_, index) => values[index] ?? "");
}

function normalizeReminderTimeInput(value: string): string {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseReminderDateParts(value: string): { year: number; month: number; day: number } | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
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
    const today = parseReminderDateParts(getIstTodayLabel());
    if (!today) return "";
    return `${String(today.year).padStart(4, "0")}-${String(today.month).padStart(2, "0")}`;
  }
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}`;
}

function shiftReminderCalendarMonth(cursor: string, monthDelta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(cursor);
  if (!match) return getReminderCalendarMonthFromDateLabel(getIstTodayLabel());
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
  const todayLabel = getIstTodayLabel();
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
  if (item.mode === "once") {
    const dateLabel = item.dateLabel ?? "No date";
    return `One time • ${dateLabel} • ${formatTimeLabel(item.hour, item.minute)} IST`;
  }

  if (item.mode === "multi") {
    const slots = item.timeSlots.map((slot) => formatTimeLabel(slot.hour, slot.minute)).join(", ");
    return `${item.timeSlots.length} time${item.timeSlots.length === 1 ? "" : "s"} • ${slots} • ${formatReminderDays(item.days)}`;
  }

  if (item.mode === "interval") {
    const start = formatTimeLabel(item.intervalStartHour ?? 8, item.intervalStartMinute ?? 0);
    const end = formatTimeLabel(item.intervalEndHour ?? 22, item.intervalEndMinute ?? 0);
    return `Every ${item.intervalMinutes ?? 60} min • ${start}-${end} • ${formatReminderDays(item.days)}`;
  }

  return `${formatTimeLabel(item.hour, item.minute)} • ${formatReminderDays(item.days)}`;
}

function formatReminderOccurrenceLabel(timestamp: number): string {
  const shifted = new Date(timestamp + IST_OFFSET_MINUTES * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const time = formatTimeLabel(shifted.getUTCHours(), shifted.getUTCMinutes());
  return `${year}-${month}-${day} • ${time} IST`;
}

function buildReminderHistoryOccurrences(
  reminder: ReminderItem,
  nowMs: number,
  pastDays: number,
  futureDays: number
): number[] {
  const candidates: number[] = [];

  if (reminder.mode === "once") {
    const parts = parseReminderDateParts(reminder.dateLabel ?? "");
    if (!parts) return [];
    const timestamp = istToUtcTimestamp(parts.year, parts.month, parts.day, reminder.hour, reminder.minute);
    const minTs = nowMs - pastDays * 24 * 60 * 60 * 1000;
    const maxTs = nowMs + futureDays * 24 * 60 * 60 * 1000;
    return timestamp >= minTs && timestamp <= maxTs ? [timestamp] : [];
  }

  const allowedDays = normalizeDays(reminder.days);
  const effectiveDays = allowedDays.length > 0 ? allowedDays : [0, 1, 2, 3, 4, 5, 6];
  const daySet = new Set<number>(effectiveDays);

  for (let dayOffset = -pastDays; dayOffset <= futureDays; dayOffset += 1) {
    const slot = toIstDayParts(nowMs, dayOffset);
    if (!daySet.has(slot.weekday)) continue;

    if (reminder.mode === "time") {
      candidates.push(istToUtcTimestamp(slot.year, slot.month, slot.day, reminder.hour, reminder.minute));
      continue;
    }

    if (reminder.mode === "multi") {
      for (const timeSlot of reminder.timeSlots) {
        candidates.push(istToUtcTimestamp(slot.year, slot.month, slot.day, timeSlot.hour, timeSlot.minute));
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
      candidates.push(istToUtcTimestamp(slot.year, slot.month, slot.day, hour, minute));
    }
  }

  return Array.from(new Set(candidates)).sort((left, right) => left - right);
}

export default function App() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [ready, setReady] = useState(false);
  const [launchDelayDone, setLaunchDelayDone] = useState(false);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);
  const [history, setHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<DashboardTab>("home");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [profileHeightCm, setProfileHeightCm] = useState("");
  const [profileWeightKg, setProfileWeightKg] = useState("");
  const [profileGoal, setProfileGoal] = useState("");
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
  const [showSplashOverlay, setShowSplashOverlay] = useState(true);
  const [activeModule, setActiveModule] = useState<AppModule>("hub");
  const appThemeSelections = DEFAULT_APP_THEME_SELECTIONS;
  const [reminderItems, setReminderItems] = useState<ReminderItem[]>([]);
  const [reminderCompletions, setReminderCompletions] = useState<ReminderCompletionEntry[]>([]);
  const [reminderTrackerView, setReminderTrackerView] = useState<ReminderTrackerView>("reminders");
  const [reminderEditorOpen, setReminderEditorOpen] = useState(false);
  const [reminderForm, setReminderForm] = useState<ReminderFormState>(INITIAL_REMINDER_FORM);
  const [reminderCalendarMonth, setReminderCalendarMonth] = useState(getReminderCalendarMonthFromDateLabel(getIstTodayLabel()));
  const [reminderNotice, setReminderNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [vaultEditorOpen, setVaultEditorOpen] = useState(false);
  const [vaultForm, setVaultForm] = useState<VaultFormState>(INITIAL_VAULT_FORM);
  const [vaultHasPin, setVaultHasPin] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultNewPin, setVaultNewPin] = useState("");
  const [vaultConfirmPin, setVaultConfirmPin] = useState("");
  const [vaultBiometricsEnabled, setVaultBiometricsEnabled] = useState(false);
  const [revealedVaultIds, setRevealedVaultIds] = useState<number[]>([]);
  const [vaultNotice, setVaultNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<"unlock" | "reveal">("unlock");
  const [pinModalInput, setPinModalInput] = useState("");
  const [pinModalError, setPinModalError] = useState("");
  const [pinModalTargetEntryId, setPinModalTargetEntryId] = useState<number | null>(null);
  const revealTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const shareCardRef = useRef<View>(null);
  const completionLoggedRef = useRef(false);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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

  const bootstrap = useCallback(async () => {
    await initDatabase();
    const [, , nextSettings, nextReminders, nextReminderCompletions] = await Promise.all([
      refreshData(),
      refreshProfile(),
      refreshSettings(),
      refreshReminderItems(),
      refreshReminderCompletions(),
      refreshVaultSecurity()
    ]);
    await syncWorkoutReminders(nextSettings).catch(() => undefined);
    await syncReminderBuddyNotifications(nextReminders, nextReminderCompletions).catch(() => undefined);
    setReady(true);
  }, [refreshData, refreshProfile, refreshReminderCompletions, refreshReminderItems, refreshSettings, refreshVaultSecurity]);

  useEffect(() => {
    bootstrap().catch((error) => {
      const message = error instanceof Error ? error.message : "Failed to start app.";
      Alert.alert("Startup error", message);
    });
  }, [bootstrap]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLaunchDelayDone(true);
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!ready || !launchDelayDone || !showSplashOverlay) return;
    Animated.timing(splashOpacity, {
      toValue: 0,
      duration: 420,
      useNativeDriver: true
    }).start(() => {
      setShowSplashOverlay(false);
    });
  }, [launchDelayDone, ready, showSplashOverlay, splashOpacity]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      refreshDashboard().catch(() => undefined);
      refreshHistory().catch(() => undefined);
      refreshReminderCompletions().catch(() => undefined);
    }, 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshDashboard().catch(() => undefined);
        refreshHistory().catch(() => undefined);
        Promise.all([refreshSettings(), refreshReminderItems(), refreshReminderCompletions()])
          .then(([nextSettings, nextReminders, nextCompletions]) => {
            syncWorkoutReminders(nextSettings).catch(() => undefined);
            syncReminderBuddyNotifications(nextReminders, nextCompletions).catch(() => undefined);
          })
          .catch(() => undefined);
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [ready, refreshDashboard, refreshHistory, refreshReminderCompletions, refreshReminderItems, refreshSettings]);

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
    Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
    revealTimeoutsRef.current = {};
    setVaultUnlocked(false);
    setRevealedVaultIds([]);
    setPinModalOpen(false);
    setPinModalError("");
    setPinModalInput("");
    setPinModalTargetEntryId(null);
  }, [activeModule]);

  useEffect(() => {
    return () => {
      Object.values(revealTimeoutsRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

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
    await refreshData();
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
          await refreshData();
        }
      }
    ]);
  };

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

  const handleStartPlan = async (plan: WorkoutPlan) => {
    try {
      const sessionId = await startWorkoutSession(plan.id, plan.name);
      completionLoggedRef.current = false;
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
        notificationsEnabled: settings.notificationsEnabled
      };

      await saveUserSettings(payload);
      setSettings(payload);
      setWeeklyGoalText(String(payload.weeklyGoal));
      setReminderHourText(String(payload.reminderHour));
      setReminderMinuteText(String(payload.reminderMinute));
      setReminderLeadTexts(ensureThreeLeadInputs(payload.reminderLeadMinutes));
      setReminderCount(Math.min(3, Math.max(1, payload.reminderLeadMinutes.length)));
      await refreshDashboard();

      const reminderResult = await syncWorkoutReminders(payload);
      const reminderFailure =
        !reminderResult.supported || reminderResult.message.toLowerCase().startsWith("reminder sync failed");
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

  const openReminderEditor = (item?: ReminderItem) => {
    if (!item) {
      const todayLabel = getIstTodayLabel();
      setReminderForm({
        ...INITIAL_REMINDER_FORM,
        dateLabel: todayLabel
      });
      setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(todayLabel));
      setReminderEditorOpen(true);
      return;
    }

    const dateLabel = item.dateLabel ?? getIstTodayLabel();
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
    try {
      if (!reminderForm.title.trim()) {
        setReminderNotice({ type: "error", message: "Reminder title is required." });
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
        timezone: "Asia/Kolkata"
      };

      if (reminderForm.mode === "time" || reminderForm.mode === "once") {
        const hour = parseStrictWholeNumber(reminderForm.hour);
        const minute = parseStrictWholeNumber(reminderForm.minute);
        if (hour == null || hour < 0 || hour > 23 || minute == null || minute < 0 || minute > 59) {
          setReminderNotice({ type: "error", message: "Time must be valid (hour 0-23, minute 0-59)." });
          return;
        }

        payload.hour = hour;
        payload.minute = minute;
        payload.dateLabel = reminderForm.mode === "once" ? reminderForm.dateLabel.trim() : null;

        if (reminderForm.mode === "once" && !parseReminderDateParts(reminderForm.dateLabel)) {
          setReminderNotice({ type: "error", message: "Use a valid date in YYYY-MM-DD format." });
          return;
        }
      } else if (reminderForm.mode === "multi") {
        const timeSlots = reminderForm.timeSlots
          .map((value) => parseReminderTimeSlotInput(value))
          .filter((value): value is ReminderTimeSlot => value != null);
        if (timeSlots.length === 0) {
          setReminderNotice({ type: "error", message: "Add at least one time in HH:MM format." });
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
          setReminderNotice({ type: "error", message: "Interval must be between 5 and 720 minutes." });
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
          setReminderNotice({ type: "error", message: "Interval start and end times must be valid." });
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
      const todayLabel = getIstTodayLabel();
      setReminderEditorOpen(false);
      setReminderForm({
        ...INITIAL_REMINDER_FORM,
        dateLabel: todayLabel
      });
      setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(todayLabel));
      setReminderNotice({ type: "success", message: sync.message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save reminder.";
      setReminderNotice({ type: "error", message });
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
      setReminderNotice({ type: "success", message: sync.message });
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

  const openPinModal = (mode: "unlock" | "reveal", entryId: number | null = null) => {
    setPinModalMode(mode);
    setPinModalTargetEntryId(entryId);
    setPinModalInput("");
    setPinModalError("");
    setPinModalOpen(true);
  };

  const closePinModal = () => {
    setPinModalOpen(false);
    setPinModalInput("");
    setPinModalError("");
    setPinModalTargetEntryId(null);
  };

  const verifyPinModal = async () => {
    try {
      const valid = await verifyVaultPin(pinModalInput);
      if (!valid) {
        setPinModalError("Incorrect PIN.");
        return;
      }

      if (pinModalMode === "unlock") {
        await refreshVaultEntries();
        setVaultUnlocked(true);
      } else if (pinModalTargetEntryId != null) {
        setRevealedVaultIds((prev) =>
          prev.includes(pinModalTargetEntryId) ? prev : [...prev, pinModalTargetEntryId]
        );
        scheduleRevealAutoHide(pinModalTargetEntryId);
      }
      closePinModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not verify PIN.";
      setPinModalError(message);
    }
  };

  const enterPasswordManager = async () => {
    const security = await refreshVaultSecurity();
    setActiveModule("password");
    if (security.hasPin) {
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
      await saveVaultBiometricsEnabled(!vaultBiometricsEnabled);
      await refreshVaultSecurity();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update biometric setting.";
      setVaultNotice({ type: "error", message });
    }
  };

  const openVaultEditor = (entry?: VaultEntry) => {
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
    try {
      await saveVaultEntry(vaultForm);
      await refreshVaultEntries();
      setVaultEditorOpen(false);
      setVaultForm(INITIAL_VAULT_FORM);
      setVaultNotice({ type: "success", message: "Password saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save password.";
      setVaultNotice({ type: "error", message });
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
    openPinModal("reveal", entryId);
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
    return `${formatTimeLabel(hour, minute)} IST workout time, remind ${previewLeads.join(", ")} min before`;
  }, [
    reminderHourText,
    reminderMinuteText,
    reminderCount,
    reminderLeadTexts,
    settings.reminderHour,
    settings.reminderMinute,
    settings.reminderLeadMinutes
  ]);

  const closeTimer = async (summary: WorkoutRunSummary) => {
    const finishedSessionId = activeSessionId;
    const finishedPlanName = activePlan?.name ?? "Workout";
    try {
      await finalizeCurrentSession(summary);
    } finally {
      setActivePlan(null);
      setActiveSessionId(null);
      await refreshData();
      if (summary.completed && finishedSessionId) {
        openSessionFeedback(finishedSessionId, finishedPlanName);
      }
    }
  };

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

  const currentWeekday = new Date().getDay();
  const isWorkoutDayToday = matchesDay(settings.workoutDays, currentWeekday);
  const workoutDaysLabel = useMemo(() => formatDays(settings.workoutDays), [settings.workoutDays]);
  const qualifyingSessionCount = useMemo(
    () => history.filter((entry) => entry.progressPercent >= 40).length,
    [history]
  );
  const todaysPlans = useMemo(
    () => plans.filter((plan) => matchesDay(plan.workoutDays, currentWeekday)),
    [currentWeekday, plans]
  );
  const quickStartPlan = isWorkoutDayToday ? (todaysPlans[0] ?? null) : null;
  const keyboardSafeBottomPadding = keyboardHeight > 0 ? keyboardHeight + 16 : 24;
  const isDarkMode = colorScheme === "dark";
  const statusBarStyle = isDarkMode ? "light" : "dark";
  const appBackground = isDarkMode ? "#05070A" : "#F6FBFF";
  const panelBackground = isDarkMode ? "#14181D" : "#FFFFFF";
  const cardBackground = isDarkMode ? "#11161B" : "#FCFEFF";
  const inputBackground = isDarkMode ? "#0B1014" : "#F5FAFD";
  const borderColor = isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(8,54,74,0.12)";
  const textPrimary = isDarkMode ? "#F4FAFF" : "#0B364A";
  const textMuted = isDarkMode ? "rgba(244,250,255,0.72)" : "#3D6F81";

  const moduleThemes = useMemo(
    () => ({
      workout: resolveModuleTheme("workout", appThemeSelections, isDarkMode),
      reminder: resolveModuleTheme("reminder", appThemeSelections, isDarkMode),
      password: resolveModuleTheme("password", appThemeSelections, isDarkMode),
      list: resolveModuleTheme("list", appThemeSelections, isDarkMode)
    }),
    [isDarkMode]
  );
  const workoutTheme = moduleThemes.workout;
  const reminderTheme = moduleThemes.reminder;
  const passwordTheme = moduleThemes.password;
  const listTheme = moduleThemes.list;
  const workoutCardStyle = { borderColor: workoutTheme.accentBorder, backgroundColor: panelBackground };
  const workoutInputSurfaceStyle = { borderColor: workoutTheme.accentBorder, backgroundColor: inputBackground };

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
        textClass: "text-[#08364A] dark:text-white",
        badgeClass: "bg-white/10",
        badgeTextClass: "text-[#1E5B71] dark:text-white/80"
      };
    }
    if (roundedBmi < 18.5) {
      return {
        label: "Underweight",
        note: "BMI below 18.5",
        textClass: "text-neon-amber",
        badgeClass: "bg-neon-amber/20",
        badgeTextClass: "text-neon-amber"
      };
    }
    if (roundedBmi < 25) {
      return {
        label: "Healthy Range",
        note: "BMI between 18.5 and 24.9",
        textClass: "text-neon-green",
        badgeClass: "bg-neon-green/20",
        badgeTextClass: "text-neon-green"
      };
    }
    if (roundedBmi < 30) {
      return {
        label: "Overweight",
        note: "BMI between 25 and 29.9",
        textClass: "text-neon-red",
        badgeClass: "bg-neon-red/20",
        badgeTextClass: "text-neon-red"
      };
    }
    return {
      label: "Obesity",
      note: "BMI 30 and above",
      textClass: "text-neon-red",
      badgeClass: "bg-neon-red/20",
      badgeTextClass: "text-neon-red"
    };
  }, [roundedBmi]);

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

  let content;

  if (!ready) {
    content = (
      <View className="flex-1" style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} />
      </View>
    );
  } else if (activeModule === "hub") {
    content = (
      <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} />
        <View className="flex-1 px-5 pb-5 pt-5">
          <View className="flex-row items-center justify-between">
            <Text className="text-4xl font-black tracking-[3px]" style={{ color: textPrimary }}>ANTHRA</Text>
            <Pressable
              onPress={() => setColorScheme(isDarkMode ? "light" : "dark")}
              className="rounded-full border px-4 py-2"
              style={{ borderColor, backgroundColor: cardBackground }}
            >
              <Text className="text-xs font-black uppercase tracking-[1px]" style={{ color: textMuted }}>
                {isDarkMode ? "Dark" : "Light"}
              </Text>
            </Pressable>
          </View>
          <View className="mt-5 flex-1 gap-3">
            <View className="flex-1 flex-row gap-3">
              <Pressable
                onPress={() => setActiveModule("workout")}
                className="flex-1 items-center justify-center rounded-3xl border p-5"
                style={{ borderColor: workoutTheme.accentBorder, backgroundColor: workoutTheme.accentSoft }}
              >
                <Dumbbell color={workoutTheme.icon} size={54} />
                <Text className="mt-3 text-center text-3xl font-black" style={{ color: textPrimary }}>Workout Buddy</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveModule("reminder")}
                className="flex-1 items-center justify-center rounded-3xl border p-5"
                style={{ borderColor: reminderTheme.accentBorder, backgroundColor: reminderTheme.accentSoft }}
              >
                <BellRing color={reminderTheme.icon} size={54} />
                <Text className="mt-3 text-center text-3xl font-black" style={{ color: textPrimary }}>Reminder Buddy</Text>
              </Pressable>
            </View>
            <View className="flex-1 flex-row gap-3">
              <Pressable
                onPress={() => {
                  enterPasswordManager().catch(() => undefined);
                }}
                className="flex-1 items-center justify-center rounded-3xl border p-5"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: passwordTheme.accentSoft }}
              >
                <KeyRound color={passwordTheme.icon} size={54} />
                <Text className="mt-3 text-center text-3xl font-black" style={{ color: textPrimary }}>Password Buddy</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveModule("list")}
                className="flex-1 items-center justify-center rounded-3xl border p-5"
                style={{ borderColor: listTheme.accentBorder, backgroundColor: listTheme.accentSoft }}
              >
                <ListTodo color={listTheme.icon} size={54} />
                <Text className="mt-3 text-center text-3xl font-black" style={{ color: textPrimary }}>List Buddy</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  } else if (activeModule === "reminder") {
    content = (
      <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} />
        <View className="border-b px-5 pb-3 pt-4" style={{ borderColor: reminderTheme.accentBorder }}>
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setActiveModule("hub")}
              className="rounded-xl border px-3 py-2"
              style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}
            >
              <Text className="text-sm font-semibold uppercase" style={{ color: textMuted }}>Back</Text>
            </Pressable>
            <Text className="text-2xl font-black" style={{ color: textPrimary }}>Reminder Buddy</Text>
            <Pressable
              onPress={() => openReminderEditor()}
              className="rounded-xl px-3 py-2"
              style={{ backgroundColor: reminderTheme.accent }}
            >
              <Text className="text-sm font-black uppercase" style={{ color: reminderTheme.onAccent }}>New</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingTop: 20, paddingBottom: keyboardSafeBottomPadding }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl border p-4" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: reminderTheme.accentSoft }}>
            <Text className="text-base font-semibold" style={{ color: textMuted }}>
              Build one-time events, repeating daily reminders, multiple daily times, or interval nudges. All reminders run on IST (Asia/Kolkata).
            </Text>
          </View>
          <View className="mt-4 flex-row gap-2">
            {([
              { value: "reminders", label: "Reminders" },
              { value: "history", label: "History" }
            ] as { value: ReminderTrackerView; label: string }[]).map((option) => {
              const selected = reminderTrackerView === option.value;
              return (
                <Pressable
                  key={`reminder-view-${option.value}`}
                  onPress={() => setReminderTrackerView(option.value)}
                  className="flex-1 rounded-2xl border px-4 py-3"
                  style={{
                    borderColor: selected ? reminderTheme.accent : reminderTheme.accentBorder,
                    backgroundColor: selected ? withAlpha(reminderTheme.accent, 0.18) : panelBackground
                  }}
                >
                  <Text className="text-center text-sm font-black uppercase" style={{ color: selected ? reminderTheme.accent : textMuted }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {reminderTrackerView === "reminders" && (
            <>
              {reminderItems.length === 0 && (
                <View className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}>
                  <Text className="text-base" style={{ color: textMuted }}>No reminders yet.</Text>
                </View>
              )}
              {reminderItems.map((item) => (
                <View key={item.id} className="mt-4 rounded-2xl border p-4" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-xl font-bold text-[#08364A] dark:text-white">{item.title}</Text>
                      <Text className="mt-1 text-xs font-black uppercase tracking-[1.2px]" style={{ color: reminderTheme.accent }}>
                        {formatReminderModeLabel(item.mode)}
                      </Text>
                      <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                        {formatReminderSchedule(item)}
                      </Text>
                      {item.note.trim().length > 0 && <Text className="mt-2 text-base text-[#2A6A80] dark:text-white/75">{item.note}</Text>}
                    </View>
                    <Pressable
                      onPress={() => handleToggleReminder(item).catch(() => undefined)}
                      className="rounded-full px-3 py-2"
                      style={{ backgroundColor: item.enabled ? withAlpha(reminderTheme.accent, 0.22) : withAlpha(textPrimary, 0.1) }}
                    >
                      <Text className="text-xs font-black uppercase" style={{ color: item.enabled ? reminderTheme.accent : textMuted }}>
                        {item.enabled ? "On" : "Off"}
                      </Text>
                    </Pressable>
                  </View>
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={() => openReminderEditor(item)}
                      className="flex-1 items-center rounded-xl py-2.5"
                      style={{ backgroundColor: reminderTheme.accent }}
                    >
                      <Text className="text-sm font-black uppercase" style={{ color: reminderTheme.onAccent }}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => handleDeleteReminder(item)} className="flex-1 items-center rounded-xl bg-neon-red/80 py-2.5">
                      <Text className="text-sm font-black uppercase text-[#08364A] dark:text-white">Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </>
          )}

          {reminderTrackerView === "history" && (
            <>
              {pendingReminderHistory.length === 0 &&
                doneReminderHistory.length === 0 && (
                  <View className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}>
                    <Text className="text-base" style={{ color: textMuted }}>No reminder activity yet.</Text>
                  </View>
                )}

              {pendingReminderHistory.length > 0 && (
                <View className="mt-4">
                  <Text className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: "#D97706" }}>Pending</Text>
                  {pendingReminderHistory.map((item) => (
                    <View
                      key={`pending-${item.reminderId}-${item.occurrenceTs}`}
                      className="mt-3 rounded-2xl border p-4"
                      style={{ borderColor: "#F5A524", backgroundColor: panelBackground }}
                    >
                      <Text className="text-lg font-bold text-[#08364A] dark:text-white">{item.title}</Text>
                      <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-[#B86A00]">
                        {formatReminderOccurrenceLabel(item.occurrenceTs)}
                      </Text>
                      {item.note.trim().length > 0 && <Text className="mt-2 text-base text-[#2A6A80] dark:text-white/75">{item.note}</Text>}
                      <Pressable
                        onPress={() => handleMarkReminderDone(item).catch(() => undefined)}
                        className="mt-3 items-center rounded-xl py-2.5"
                        style={{ backgroundColor: "#16A34A" }}
                      >
                        <Text className="text-sm font-black uppercase text-white">Done</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {doneReminderHistory.length > 0 && (
                <View className="mt-4">
                  <Text className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: "#16A34A" }}>Done</Text>
                  {doneReminderHistory.map((item) => (
                    <View
                      key={`done-${item.reminderId}-${item.occurrenceTs}`}
                      className="mt-3 rounded-2xl border p-4"
                      style={{ borderColor: "#16A34A", backgroundColor: withAlpha("#16A34A", 0.1) }}
                    >
                      <Text className="text-lg font-bold text-[#08364A] dark:text-white">{item.title}</Text>
                      <Text className="mt-1 text-sm font-semibold uppercase tracking-[1.2px] text-[#15803D]">
                        {formatReminderOccurrenceLabel(item.occurrenceTs)}
                      </Text>
                      {item.note.trim().length > 0 && <Text className="mt-2 text-base text-[#2A6A80] dark:text-white/75">{item.note}</Text>}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {reminderNotice && (
            <View
              className={`mt-4 rounded-2xl border px-4 py-3 ${
                reminderNotice.type === "success"
                  ? "border-neon-green/40 bg-neon-green/15"
                  : "border-neon-red/40 bg-neon-red/15"
              }`}
            >
              <Text className={`text-base font-semibold ${reminderNotice.type === "success" ? "text-neon-green" : "text-neon-red"}`}>
                {reminderNotice.message}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  } else if (activeModule === "password") {
    content = (
      <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} />
        <View className="border-b px-5 pb-3 pt-4" style={{ borderColor: passwordTheme.accentBorder }}>
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setActiveModule("hub")}
              className="rounded-xl border px-3 py-2"
              style={{ borderColor: passwordTheme.accentBorder, backgroundColor: panelBackground }}
            >
              <Text className="text-sm font-semibold uppercase" style={{ color: textMuted }}>Back</Text>
            </Pressable>
            <Text className="text-2xl font-black" style={{ color: textPrimary }}>Password Manager</Text>
            <View style={{ width: 58 }} />
          </View>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingTop: 20, paddingBottom: keyboardSafeBottomPadding }}
          keyboardShouldPersistTaps="handled"
        >
          {!vaultHasPin && (
            <View className="rounded-2xl border p-5" style={{ borderColor: passwordTheme.accentBorder, backgroundColor: passwordTheme.accentSoft }}>
              <Text className="text-xl font-black" style={{ color: textPrimary }}>Set up your vault PIN</Text>
              <TextInput
                value={vaultNewPin}
                onChangeText={(value) => setVaultNewPin(digitsOnly(value))}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                placeholder="New PIN"
                placeholderTextColor="#7A7A7A"
                className="mt-4 rounded-2xl border px-4 py-3 text-lg font-semibold"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              <TextInput
                value={vaultConfirmPin}
                onChangeText={(value) => setVaultConfirmPin(digitsOnly(value))}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                placeholder="Confirm PIN"
                placeholderTextColor="#7A7A7A"
                className="mt-3 rounded-2xl border px-4 py-3 text-lg font-semibold"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              <Pressable
                onPress={() => handleSetupVaultPin().catch(() => undefined)}
                className="mt-4 items-center rounded-xl py-3"
                style={{ backgroundColor: passwordTheme.accent }}
              >
                <Text className="text-lg font-black" style={{ color: passwordTheme.onAccent }}>Save PIN</Text>
              </Pressable>
            </View>
          )}
          {vaultHasPin && !vaultUnlocked && (
            <View className="rounded-2xl border p-5" style={{ borderColor: passwordTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-xl font-black" style={{ color: textPrimary }}>Vault Locked</Text>
              <Text className="mt-2 text-base" style={{ color: textMuted }}>Use PIN modal to unlock.</Text>
              <Pressable
                onPress={() => openPinModal("unlock")}
                className="mt-4 items-center rounded-xl py-3"
                style={{ backgroundColor: passwordTheme.accent }}
              >
                <Text className="text-lg font-black" style={{ color: passwordTheme.onAccent }}>Unlock with PIN</Text>
              </Pressable>
            </View>
          )}
          {vaultHasPin && vaultUnlocked && (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-2xl font-black" style={{ color: textPrimary }}>Saved Credentials</Text>
                <Pressable
                  onPress={() => openVaultEditor()}
                  className="rounded-xl px-4 py-2"
                  style={{ backgroundColor: passwordTheme.accent }}
                >
                  <Text className="text-sm font-black uppercase" style={{ color: passwordTheme.onAccent }}>Add</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => handleToggleVaultBiometrics().catch(() => undefined)}
                className={`mt-4 rounded-2xl border px-4 py-3 ${
                  vaultBiometricsEnabled ? "border-neon-green/50 bg-neon-green/15" : "border-[#05AED5]/35 dark:border-white/20 bg-panel dark:bg-[#151515]"
                }`}
              >
                <Text className={`text-base font-black uppercase ${vaultBiometricsEnabled ? "text-neon-green" : "text-[#2A6A80] dark:text-white/75"}`}>
                  {vaultBiometricsEnabled ? "Fingerprint On" : "Fingerprint Off"}
                </Text>
              </Pressable>
              {vaultEntries.length === 0 && (
                <View className="mt-4 rounded-2xl border border-dashed border-[#05AED5]/35 dark:border-white/20 bg-panel dark:bg-[#151515] p-4">
                  <Text className="text-base text-[#2A6A80] dark:text-white/75">No passwords saved yet.</Text>
                </View>
              )}
              {vaultEntries.map((entry) => {
                const isVisible = revealedVaultIds.includes(entry.id);
                return (
                  <View key={entry.id} className="mt-4 rounded-2xl border p-4" style={{ borderColor: passwordTheme.accentBorder, backgroundColor: panelBackground }}>
                    <Text className="text-xl font-bold text-[#08364A] dark:text-white">{entry.appName}</Text>
                    <Text className="mt-1 text-lg font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                      {entry.accountId}
                    </Text>
                    <Text className="mt-2 text-lg text-[#144E65] dark:text-white/85">{isVisible ? entry.secret : "••••••••••••"}</Text>
                    <View className="mt-3 flex-row gap-2">
                      <Pressable
                        onPress={() => handleToggleShowPassword(entry.id, isVisible)}
                        className="flex-1 items-center rounded-xl border border-[#05AED5]/35 dark:border-white/20 bg-ink dark:bg-[#050505] py-2.5"
                      >
                        <Text className="text-sm font-bold uppercase text-[#1E5B71] dark:text-white/80">{isVisible ? "Hide" : "Show"}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => openVaultEditor(entry)}
                        className="flex-1 items-center rounded-xl py-2.5"
                        style={{ backgroundColor: passwordTheme.accent }}
                      >
                        <Text className="text-sm font-black uppercase" style={{ color: passwordTheme.onAccent }}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteVault(entry)} className="flex-1 items-center rounded-xl bg-neon-red/80 py-2.5">
                        <Text className="text-sm font-black uppercase text-[#08364A] dark:text-white">Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </>
          )}
          {vaultNotice && (
            <View
              className={`mt-4 rounded-2xl border px-4 py-3 ${
                vaultNotice.type === "success"
                  ? "border-neon-green/40 bg-neon-green/15"
                  : "border-neon-red/40 bg-neon-red/15"
              }`}
            >
              <Text className={`text-base font-semibold ${vaultNotice.type === "success" ? "text-neon-green" : "text-neon-red"}`}>
                {vaultNotice.message}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  } else if (activeModule === "list") {
    content = (
      <ListBuddyScreen
        onBack={() => {
          setActiveModule("hub");
        }}
        isDarkMode={isDarkMode}
        theme={listTheme}
      />
    );
  } else if (activePlan) {
    content = (
      <GestureHandlerRootView className="flex-1" style={{ flex: 1 }}>
        <StatusBar style={statusBarStyle} />
        <TimerScreen
          plan={activePlan}
          onComplete={handleWorkoutComplete}
          onBack={closeTimer}
          isDarkMode={isDarkMode}
          accentColor={workoutTheme.accent}
          accentSoftColor={workoutTheme.accentSoft}
          accentTextColor={workoutTheme.onAccent}
        />
      </GestureHandlerRootView>
    );
  } else {
    content = (
      <GestureHandlerRootView className="flex-1" style={{ flex: 1, backgroundColor: appBackground }}>
        <StatusBar style={statusBarStyle} />
        <SafeAreaView className="flex-1" edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: appBackground }}>
          <View className="border-b px-5 pb-3 pt-7" style={{ borderColor: workoutTheme.accentBorder }}>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-3xl font-black tracking-[3px]" style={{ color: workoutTheme.accent }}>ANTHRA</Text>
                <Text className="mt-1 text-base font-black" style={{ color: textPrimary }}>{tabTitle}</Text>
              </View>
              <Pressable
                onPress={() => setActiveModule("hub")}
                className="rounded-xl border px-3 py-2"
                style={{ borderColor: workoutTheme.accentBorder, backgroundColor: panelBackground }}
              >
                <Text className="text-sm font-semibold uppercase" style={{ color: textMuted }}>Hub</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingTop: 24, paddingBottom: keyboardSafeBottomPadding }}
            keyboardShouldPersistTaps="handled"
          >
            {activeTab === "home" && (
              <>
                <View className="rounded-3xl border p-5" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: workoutTheme.accentSoft }}>
                  <View className="flex-row items-center justify-between">
                    <View className="rounded-full px-3 py-1" style={{ backgroundColor: withAlpha(workoutTheme.accent, 0.2) }}>
                      <Text className="text-xs font-black uppercase tracking-[1.5px]" style={{ color: workoutTheme.accent }}>
                        {isWorkoutDayToday ? "Workout Day" : "Recovery Day"}
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold uppercase tracking-[1.5px] text-[#4A8FA2] dark:text-white/60">
                      {workoutDaysLabel}
                    </Text>
                  </View>

                  <Text className="mt-4 text-3xl font-black text-[#08364A] dark:text-white">
                    {quickStartPlan
                      ? `Start ${quickStartPlan.name}`
                      : isWorkoutDayToday
                        ? "Pick a plan for today"
                        : "Today is for recovery"}
                  </Text>

                  <Text className="mt-2 text-sm leading-6 text-[#34768B] dark:text-white/70">
                    {quickStartPlan
                      ? todaysPlans.length > 1
                        ? `${todaysPlans.length} plans match today. Anthra is ready to launch the first one.`
                        : "Your scheduled workout is ready to go."
                      : isWorkoutDayToday
                        ? "Your schedule says today is a workout day, but no plan is assigned yet."
                        : "No workout is scheduled today. You can review progress, adjust plans, or keep it as a rest day."}
                  </Text>

                  <View className="mt-5 flex-row gap-3">
                    <Pressable
                      onPress={() => {
                        if (quickStartPlan) {
                          handleStartPlan(quickStartPlan);
                          return;
                        }
                        setActiveTab(isWorkoutDayToday ? "plans" : "history");
                      }}
                      className="flex-1 items-center rounded-2xl py-3.5"
                      style={{ backgroundColor: workoutTheme.accent }}
                    >
                      <Text className="text-base font-black" style={{ color: workoutTheme.onAccent }}>
                        {quickStartPlan ? "Start Workout" : isWorkoutDayToday ? "Choose Plan" : "View History"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setActiveTab("plans")}
                      className="flex-1 items-center rounded-2xl border py-3.5"
                      style={{ borderColor: workoutTheme.accentBorder, backgroundColor: panelBackground }}
                    >
                      <Text className="text-base font-black" style={{ color: textPrimary }}>Manage Plans</Text>
                    </Pressable>
                  </View>
                </View>

                <View className="mt-5 flex-row gap-3">
                  <View className="flex-1 rounded-2xl border p-4" style={workoutCardStyle}>
                    <Text className="text-xs font-semibold uppercase tracking-[1.7px] text-[#4A8FA2] dark:text-white/60">Streak</Text>
                    <Text className="mt-2 text-4xl font-black" style={{ color: workoutTheme.accent }}>{stats.currentStreak}</Text>
                    <Text className="text-sm font-semibold text-[#34768B] dark:text-white/70">days</Text>
                  </View>
                  <View className="flex-1 rounded-2xl border p-4" style={workoutCardStyle}>
                    <Text className="text-xs font-semibold uppercase tracking-[1.7px] text-[#4A8FA2] dark:text-white/60">Sessions</Text>
                    <Text className="mt-2 text-4xl font-black text-[#08364A] dark:text-white">{qualifyingSessionCount}</Text>
                    <Text className="text-sm font-semibold text-[#34768B] dark:text-white/70">logged</Text>
                  </View>
                </View>

                <View className="mt-5 rounded-3xl border p-5" style={workoutCardStyle}>
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">
                        Weekly Progress
                      </Text>
                      <Text className="mt-1 text-xl font-black text-[#08364A] dark:text-white">
                        {stats.weekCompleted >= stats.weekGoal ? "Goal on track" : "Keep the streak moving"}
                      </Text>
                    </View>
                    <Pressable onPress={handleShare} className="rounded-xl px-4 py-2" style={{ backgroundColor: workoutTheme.accent }}>
                      <Text className="text-sm font-black" style={{ color: workoutTheme.onAccent }}>Share</Text>
                    </Pressable>
                  </View>

                  <View className="mt-4">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-[#34768B] dark:text-white/70">Completed this week</Text>
                      <Text className="text-sm font-semibold text-[#0D4158] dark:text-white/90">
                        {stats.weekCompleted}/{stats.weekGoal}
                      </Text>
                    </View>
                    <ProgressBar
                      value={stats.weekCompleted}
                      max={stats.weekGoal}
                      fillColor={workoutTheme.accent}
                      trackColor={isDarkMode ? "rgba(255,255,255,0.2)" : "#D6EDF5"}
                    />
                  </View>

                  <Text className="mt-3 text-xs font-semibold uppercase tracking-[1.5px] text-[#4A8FA2] dark:text-white/60">
                    {stats.streakWeeks > 0
                      ? `Streak running for ${stats.streakWeeks} week${stats.streakWeeks === 1 ? "" : "s"}`
                      : "Finish this week strong to start your streak"}
                  </Text>
                </View>

              </>
            )}

            {activeTab === "plans" && (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="text-2xl font-black text-[#08364A] dark:text-white">Your Plans</Text>
                  <Pressable onPress={openCreatePlan} className="rounded-xl px-4 py-2" style={{ backgroundColor: workoutTheme.accent }}>
                    <Text className="font-black" style={{ color: workoutTheme.onAccent }}>New</Text>
                  </Pressable>
                </View>

                {plans.length === 0 && (
                  <View className="mt-4 rounded-2xl border border-dashed p-4" style={workoutCardStyle}>
                    <Text className="text-sm text-[#34768B] dark:text-white/70">
                      Create your first plan to unlock the timer flow.
                    </Text>
                  </View>
                )}

                {plans.map((plan) => {
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
                          className="ml-3 mt-4 items-center justify-center rounded-2xl bg-neon-red px-6"
                        >
                          <Text className="font-bold text-[#08364A] dark:text-white">Delete</Text>
                        </Pressable>
                      )}
                    >
                      <View className="mt-4 rounded-2xl border p-4" style={workoutCardStyle}>
                        <View className="flex-row items-start justify-between">
                          <View className="flex-1 pr-3">
                            <Text className="text-lg font-bold text-[#08364A] dark:text-white">{plan.name}</Text>
                            <Text className="mt-1 text-sm text-[#3E8196] dark:text-white/65">
                              {setCount} set(s) • {exerciseCount} exercise(s)
                            </Text>
                            <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px] text-[#559AAE] dark:text-white/55">
                              {formatDays(plan.workoutDays)}
                            </Text>
                          </View>
                          <Pressable onPress={() => openEditPlan(plan)}>
                            <Text className="font-semibold" style={{ color: workoutTheme.accent }}>Edit</Text>
                          </Pressable>
                        </View>
                        <Pressable
                          onPress={() => handleStartPlan(plan)}
                          className="mt-4 rounded-xl py-3"
                          style={{ backgroundColor: workoutTheme.accent }}
                        >
                          <Text className="text-center text-base font-black" style={{ color: workoutTheme.onAccent }}>Let's Begin</Text>
                        </Pressable>
                      </View>
                    </Swipeable>
                  );
                })}
              </>
            )}

            {activeTab === "history" && (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="text-2xl font-black text-[#08364A] dark:text-white">Workout History</Text>
                  <Text className="text-sm font-semibold text-[#4A8FA2] dark:text-white/60">{history.length} sessions</Text>
                </View>

                {history.length === 0 && (
                  <View className="mt-4 rounded-2xl border border-dashed p-4" style={workoutCardStyle}>
                    <Text className="text-sm text-[#34768B] dark:text-white/70">No workout history yet. Start your first session.</Text>
                  </View>
                )}

                {history.map((entry) => (
                  <View key={entry.id} className="mt-4 rounded-2xl border p-4" style={workoutCardStyle}>
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-base font-bold text-[#08364A] dark:text-white">{entry.planName}</Text>
                        <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.5px] text-[#4A8FA2] dark:text-white/60">
                          {formatHistoryDate(entry.startedAt)}
                        </Text>
                      </View>
                      <View className="items-end gap-2">
                        <Pressable onPress={() => handleDeleteHistoryEntry(entry)} className="h-8 w-8 items-center justify-center">
                          <Trash2 size={16} color={isDarkMode ? "#FF8D98" : "#D95464"} />
                        </Pressable>
                        <View
                          className={`rounded-lg px-2 py-1 ${
                            entry.completed ? "bg-neon-green/25" : "bg-neon-amber/25"
                          }`}
                        >
                          <Text
                            className={`text-xs font-black uppercase ${
                              entry.completed ? "text-neon-green" : "text-neon-amber"
                            }`}
                          >
                            {entry.completed ? "Completed" : "Partial"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="mt-3">
                      <View className="mb-1 flex-row items-center justify-between">
                        <Text className="text-sm font-semibold text-[#34768B] dark:text-white/70">Progress</Text>
                        <Text className="text-sm font-semibold text-[#0D4158] dark:text-white/90">
                          {Math.round(entry.progressPercent)}%
                        </Text>
                      </View>
                      <ProgressBar
                        value={entry.progressPercent}
                        max={100}
                        fillColor={workoutTheme.accent}
                        trackColor={isDarkMode ? "rgba(255,255,255,0.2)" : "#D6EDF5"}
                      />
                    </View>

                    <Text className="mt-2 text-xs text-[#3E8196] dark:text-white/65">
                      {entry.completedSegments}/{entry.totalSegments} segments • {formatDuration(entry.elapsedSeconds)}
                    </Text>

                    {entry.rating != null && (
                      <Text className="mt-2 text-xs font-semibold uppercase tracking-[1.2px] text-neon-amber">
                        {"*".repeat(entry.rating)} ({entry.rating}/5)
                      </Text>
                    )}

                    {entry.comment.trim().length > 0 && (
                      <View className="mt-2 rounded-xl border px-3 py-2" style={workoutInputSurfaceStyle}>
                        <Text className="text-xs text-[#2A6A80] dark:text-white/75">{entry.comment}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            {activeTab === "profile" && (
              <>
                <View className="rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">Body Metrics</Text>
                  <View className="mt-4 flex-row gap-3">
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-[#3E8196] dark:text-white/65">Height (cm)</Text>
                      <TextInput
                        value={profileHeightCm}
                        onChangeText={handleProfileHeightChange}
                        keyboardType="decimal-pad"
                        placeholder="170"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border px-4 py-3 text-base font-semibold text-[#08364A] dark:text-white"
                        style={workoutInputSurfaceStyle}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-[#3E8196] dark:text-white/65">Weight (kg)</Text>
                      <TextInput
                        value={profileWeightKg}
                        onChangeText={handleProfileWeightChange}
                        keyboardType="decimal-pad"
                        placeholder="70"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border px-4 py-3 text-base font-semibold text-[#08364A] dark:text-white"
                        style={workoutInputSurfaceStyle}
                      />
                    </View>
                  </View>
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">BMI</Text>
                    <View className={`rounded-full px-3 py-1 ${bmiSummary.badgeClass}`}>
                      <Text className={`text-xs font-black uppercase ${bmiSummary.badgeTextClass}`}>
                        {bmiSummary.label}
                      </Text>
                    </View>
                  </View>
                  <Text className={`mt-3 text-6xl font-black ${bmiSummary.textClass}`}>
                    {roundedBmi != null ? roundedBmi : "--"}
                  </Text>
                  <Text className="mt-2 text-sm text-[#34768B] dark:text-white/70">{bmiSummary.note}</Text>
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">Goals</Text>
                  <TextInput
                    value={profileGoal}
                    onChangeText={handleProfileGoalChange}
                    multiline
                    textAlignVertical="top"
                    placeholder="Example: Reach 68kg and train 4 days/week."
                    placeholderTextColor="#7A7A7A"
                    className="mt-3 min-h-[120px] rounded-2xl border px-4 py-3 text-base text-[#08364A] dark:text-white"
                    style={workoutInputSurfaceStyle}
                  />
                </View>

                <Pressable
                  onPress={handleSaveProfile}
                  className="mt-5 items-center rounded-2xl py-4"
                  style={{ backgroundColor: workoutTheme.accent }}
                  disabled={profileSaving}
                >
                  <Text className="text-base font-black" style={{ color: workoutTheme.onAccent }}>
                    {profileSaving ? "Saving..." : "Save Profile"}
                  </Text>
                </Pressable>

                {profileNotice && (
                  <View
                    className={`mt-3 rounded-2xl border px-4 py-3 ${
                      profileNotice.type === "success"
                        ? "border-neon-green/40 bg-neon-green/15"
                        : "border-neon-red/40 bg-neon-red/15"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        profileNotice.type === "success" ? "text-neon-green" : "text-neon-red"
                      }`}
                    >
                      {profileNotice.message}
                    </Text>
                  </View>
                )}
              </>
            )}

            {activeTab === "settings" && (
              <>
                <View className="rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">
                    Workout Schedule
                  </Text>
                  <Text className="mt-2 text-sm text-[#34768B] dark:text-white/70">
                    Active days: {workoutDaysLabel}. Select the days you plan to train.
                  </Text>

                  <View className="mt-4 flex-row flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map((day) => {
                      const isActive = settings.workoutDays.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          onPress={() => toggleGlobalWorkoutDay(day.value)}
                          className="rounded-full border px-3 py-2"
                          style={{
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
                    <Text className="mb-2 text-xs font-semibold text-[#3E8196] dark:text-white/65">Weekly Streak Goal (1-7)</Text>
                    <TextInput
                      value={weeklyGoalText}
                      onChangeText={(value) => {
                        if (settingsNotice) setSettingsNotice(null);
                        setWeeklyGoalText(digitsOnly(value));
                      }}
                      keyboardType="number-pad"
                      placeholder="4"
                      placeholderTextColor="#7A7A7A"
                      className="rounded-2xl border px-4 py-3 text-base font-semibold text-[#08364A] dark:text-white"
                      style={workoutInputSurfaceStyle}
                    />
                    <Text className="mt-2 text-xs text-[#4A8FA2] dark:text-white/60">
                      Streak increments when completed workout days reach this weekly goal.
                    </Text>
                  </View>
                </View>

                <View className="mt-4 rounded-3xl border p-5" style={workoutCardStyle}>
                  <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">
                    Reminder Settings
                  </Text>
                  <Text className="mt-2 text-sm text-[#34768B] dark:text-white/70">
                    Choose workout time and set up to 3 reminder intervals.
                  </Text>
                  <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                    Scheduled in IST (Asia/Kolkata)
                  </Text>

                  <Pressable
                    onPress={() => {
                      if (settingsNotice) setSettingsNotice(null);
                      setSettings((prev) => ({
                        ...prev,
                        notificationsEnabled: !prev.notificationsEnabled
                      }));
                    }}
                    className={`mt-4 rounded-2xl border px-4 py-3 ${
                      settings.notificationsEnabled
                        ? "border-neon-green/50 bg-neon-green/15"
                        : "border-[#05AED5]/35 dark:border-white/20 bg-ink dark:bg-[#050505]"
                    }`}
                  >
                    <Text
                      className={`text-sm font-black uppercase ${
                        settings.notificationsEnabled ? "text-neon-green" : "text-[#2A6A80] dark:text-white/75"
                      }`}
                    >
                      {settings.notificationsEnabled ? "Reminders On" : "Reminders Off"}
                    </Text>
                  </Pressable>

                  <View className="mt-4 flex-row gap-3">
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-[#3E8196] dark:text-white/65">Hour (0-23)</Text>
                      <TextInput
                        value={reminderHourText}
                        onChangeText={(value) => {
                          if (settingsNotice) setSettingsNotice(null);
                          setReminderHourText(digitsOnly(value));
                        }}
                        keyboardType="number-pad"
                        placeholder="18"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border px-4 py-3 text-base font-semibold text-[#08364A] dark:text-white"
                        style={workoutInputSurfaceStyle}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="mb-2 text-xs font-semibold text-[#3E8196] dark:text-white/65">Minute (0-59)</Text>
                      <TextInput
                        value={reminderMinuteText}
                        onChangeText={(value) => {
                          if (settingsNotice) setSettingsNotice(null);
                          setReminderMinuteText(digitsOnly(value));
                        }}
                        keyboardType="number-pad"
                        placeholder="00"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border px-4 py-3 text-base font-semibold text-[#08364A] dark:text-white"
                        style={workoutInputSurfaceStyle}
                      />
                    </View>
                  </View>

                  <View className="mt-4">
                    <Text className="mb-2 text-xs font-semibold text-[#3E8196] dark:text-white/65">How many reminders?</Text>
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
                            className="flex-1 items-center rounded-xl border py-2"
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
                      <View key={`lead-${index}`}>
                        <Text className="mb-1 text-xs font-semibold text-[#3E8196] dark:text-white/65">
                          Reminder {index + 1} lead (0-720 min before)
                        </Text>
                        <TextInput
                          value={reminderLeadTexts[index] ?? ""}
                          onChangeText={(value) => updateReminderLeadText(index, value)}
                          keyboardType="number-pad"
                          placeholder={index === 0 ? "30" : index === 1 ? "15" : "5"}
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-base font-semibold text-[#08364A] dark:text-white"
                          style={workoutInputSurfaceStyle}
                        />
                      </View>
                    ))}
                  </View>

                  <Text className="mt-3 text-xs font-semibold uppercase tracking-[1.5px] text-[#4A8FA2] dark:text-white/60">
                    {reminderPreview}
                  </Text>
                </View>

                <Pressable
                  onPress={handleSaveSettings}
                  className="mt-5 items-center rounded-2xl py-4"
                  style={{ backgroundColor: workoutTheme.accent }}
                  disabled={settingsSaving}
                >
                  <Text className="text-base font-black" style={{ color: workoutTheme.onAccent }}>
                    {settingsSaving ? "Saving..." : "Save Settings"}
                  </Text>
                </Pressable>

                {settingsNotice && (
                  <View
                    className={`mt-3 rounded-2xl border px-4 py-3 ${
                      settingsNotice.type === "success"
                        ? "border-neon-green/40 bg-neon-green/15"
                        : "border-neon-red/40 bg-neon-red/15"
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        settingsNotice.type === "success" ? "text-neon-green" : "text-neon-red"
                      }`}
                    >
                      {settingsNotice.message}
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View className="border-t px-4 pb-4 pt-3" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: appBackground }}>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setActiveTab("home")}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: activeTab === "home" ? workoutTheme.accent : panelBackground }}
              >
                <Text className="text-xs font-bold" style={{ color: activeTab === "home" ? workoutTheme.onAccent : textMuted }}>
                  Home
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("plans")}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: activeTab === "plans" ? workoutTheme.accent : panelBackground }}
              >
                <Text className="text-xs font-bold" style={{ color: activeTab === "plans" ? workoutTheme.onAccent : textMuted }}>
                  Plans
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("history")}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: activeTab === "history" ? workoutTheme.accent : panelBackground }}
              >
                <Text className="text-xs font-bold" style={{ color: activeTab === "history" ? workoutTheme.onAccent : textMuted }}>
                  History
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("profile")}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: activeTab === "profile" ? workoutTheme.accent : panelBackground }}
              >
                <Text className="text-xs font-bold" style={{ color: activeTab === "profile" ? workoutTheme.onAccent : textMuted }}>
                  Profile
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveTab("settings")}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: activeTab === "settings" ? workoutTheme.accent : panelBackground }}
              >
                <Text className="text-xs font-bold" style={{ color: activeTab === "settings" ? workoutTheme.onAccent : textMuted }}>
                  Settings
                </Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>

        <View className="absolute -left-[2000px] -top-[2000px]">
          <View ref={shareCardRef} collapsable={false}>
            <StreakCard
              streakDays={stats.currentStreak}
              streakWeeks={stats.streakWeeks}
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
            className="flex-1 justify-center bg-black/70 px-6"
          >
            <View className="rounded-3xl border p-5" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-xl font-black" style={{ color: textPrimary }}>Rate Session</Text>
              <Text className="mt-2 text-sm text-[#34768B] dark:text-white/70">
                {feedbackPlanName} is complete. Add a quick rating and optional note for your history.
              </Text>

              <View className="mt-4 flex-row justify-between rounded-2xl border px-3 py-3" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: inputBackground }}>
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = feedbackRating >= star;
                  return (
                    <Pressable
                      key={`rating-${star}`}
                      onPress={() => setFeedbackRating(star)}
                      className="h-11 w-11 items-center justify-center rounded-xl"
                      style={{ backgroundColor: active ? withAlpha(workoutTheme.accent, 0.25) : panelBackground }}
                    >
                      <Text className="text-xl font-black" style={{ color: active ? workoutTheme.accent : isDarkMode ? "rgba(255,255,255,0.4)" : "#78BFCE" }}>
                        *
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setFeedbackNoteModalOpen(true)}
                className="mt-4 min-h-[110px] rounded-2xl border px-4 py-3"
                style={{ borderColor: workoutTheme.accentBorder, backgroundColor: inputBackground }}
              >
                <Text className="text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                  Session Note
                </Text>
                <Text className={`mt-2 text-sm ${feedbackComment.trim() ? "text-[#08364A] dark:text-white" : "text-[#61A7B9] dark:text-white/50"}`}>
                  {feedbackComment.trim() || "Tap to add how this session felt."}
                </Text>
              </Pressable>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setFeedbackOpen(false)}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{ borderColor: workoutTheme.accentBorder, backgroundColor: inputBackground }}
                  disabled={feedbackSaving}
                >
                  <Text className="font-semibold text-[#2A6A80] dark:text-white/75">Later</Text>
                </Pressable>
                <Pressable
                  onPress={handleSubmitFeedback}
                  className="flex-1 items-center rounded-xl py-3"
                  style={{ backgroundColor: workoutTheme.accent }}
                  disabled={feedbackSaving}
                >
                  <Text className="font-black" style={{ color: workoutTheme.onAccent }}>{feedbackSaving ? "Saving..." : "Save Feedback"}</Text>
                </Pressable>
              </View>
            </View>
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
            className="flex-1 justify-center bg-black/70 px-6"
          >
            <View className="rounded-3xl border p-5" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-xl font-black" style={{ color: textPrimary }}>Session Note</Text>
              <TextInput
                value={feedbackComment}
                onChangeText={setFeedbackComment}
                multiline
                textAlignVertical="top"
                maxLength={400}
                placeholder="How did this session feel?"
                placeholderTextColor="#7A7A7A"
                className="mt-4 min-h-[140px] rounded-2xl border px-4 py-3 text-sm text-[#08364A] dark:text-white"
                style={{ borderColor: workoutTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setFeedbackNoteModalOpen(false)}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{ borderColor: workoutTheme.accentBorder, backgroundColor: inputBackground }}
                >
                  <Text className="font-semibold text-[#2A6A80] dark:text-white/75">Done</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setFeedbackComment("");
                    setFeedbackNoteModalOpen(false);
                  }}
                  className="flex-1 items-center rounded-xl py-3"
                  style={{ backgroundColor: workoutTheme.accent }}
                >
                  <Text className="font-black" style={{ color: workoutTheme.onAccent }}>Clear</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </GestureHandlerRootView>
    );
  }

  return (
    <SafeAreaProvider>
      <View className="flex-1" style={{ flex: 1 }}>
        {content}
        <Modal
          visible={reminderEditorOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setReminderEditorOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/70 px-6"
          >
            <View className="rounded-3xl border p-5" style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-2xl font-black" style={{ color: textPrimary }}>
                {reminderForm.id ? "Edit Reminder" : "New Reminder"}
              </Text>
              <ScrollView
                className="mt-2 max-h-[520px]"
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                <TextInput
                  value={reminderForm.title}
                  onChangeText={(value) => setReminderForm((prev) => ({ ...prev, title: value }))}
                  placeholder="Title"
                  placeholderTextColor="#7A7A7A"
                  className="mt-2 rounded-2xl border px-4 py-3 text-lg font-semibold"
                  style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                />
                <Text className="mb-2 mt-3 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Reminder Type</Text>
                <View className="flex-row flex-wrap gap-2">
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
                          const nextDateLabel = reminderForm.dateLabel || getIstTodayLabel();
                          setReminderForm((prev) => ({
                            ...prev,
                            mode: option.value,
                            dateLabel: prev.dateLabel || nextDateLabel
                          }));
                          if (option.value === "once") {
                            setReminderCalendarMonth(getReminderCalendarMonthFromDateLabel(nextDateLabel));
                          }
                        }}
                        className="rounded-full border px-3 py-2"
                        style={{
                          borderColor: selected ? reminderTheme.accent : reminderTheme.accentBorder,
                          backgroundColor: selected ? withAlpha(reminderTheme.accent, 0.18) : inputBackground
                        }}
                      >
                        <Text className="text-xs font-black uppercase" style={{ color: selected ? reminderTheme.accent : textMuted }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="mt-2 text-xs text-[#4A8FA2] dark:text-white/60">
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
                    <View className="mt-3 flex-row gap-3">
                      <View className="flex-1">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Hour</Text>
                        <TextInput
                          value={reminderForm.hour}
                          onChangeText={(value) => setReminderForm((prev) => ({ ...prev, hour: digitsOnly(value) }))}
                          keyboardType="number-pad"
                          placeholder="9"
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Minute</Text>
                        <TextInput
                          value={reminderForm.minute}
                          onChangeText={(value) => setReminderForm((prev) => ({ ...prev, minute: digitsOnly(value) }))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                        />
                      </View>
                    </View>
                    {reminderForm.mode === "once" && (
                      <View className="mt-3">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Date</Text>
                        <View
                          className="rounded-2xl border p-3"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground }}
                        >
                          <View className="flex-row items-center justify-between">
                            <Pressable
                              onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, -1))}
                              className="rounded-xl border px-3 py-2"
                              style={{ borderColor: reminderTheme.accentBorder, backgroundColor: panelBackground }}
                            >
                              <Text className="text-xs font-black uppercase" style={{ color: textMuted }}>Prev</Text>
                            </Pressable>
                            <Text className="text-base font-black" style={{ color: textPrimary }}>
                              {formatReminderCalendarMonth(reminderCalendarMonth)}
                            </Text>
                            <Pressable
                              onPress={() => setReminderCalendarMonth((prev) => shiftReminderCalendarMonth(prev, 1))}
                              className="rounded-xl border px-3 py-2"
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
                                >
                                  <View
                                    className="h-10 w-10 items-center justify-center rounded-full border"
                                    style={{
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
                        <Text className="mt-2 text-xs text-[#4A8FA2] dark:text-white/60">
                          Selected: {reminderForm.dateLabel || getIstTodayLabel()} in IST.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {reminderForm.mode === "multi" && (
                  <View className="mt-3">
                    <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Times</Text>
                    <View className="flex-row flex-wrap gap-3">
                      {reminderForm.timeSlots.map((slot, index) => (
                        <View key={`slot-${index}`} className="w-[47%]">
                          <TextInput
                            value={slot}
                            onChangeText={(value) =>
                              setReminderForm((prev) => {
                                const nextSlots = [...prev.timeSlots];
                                nextSlots[index] = normalizeReminderTimeInput(value);
                                return { ...prev, timeSlots: ensureReminderTimeInputs(nextSlots) };
                              })
                            }
                            placeholder={["08:00", "13:00", "20:00", "22:00"][index]}
                            placeholderTextColor="#7A7A7A"
                            className="rounded-2xl border px-4 py-3 text-base font-semibold"
                            style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                          />
                        </View>
                      ))}
                    </View>
                    <Text className="mt-2 text-xs text-[#4A8FA2] dark:text-white/60">
                      Add up to 4 daily times in `HH:MM` format.
                    </Text>
                  </View>
                )}

                {reminderForm.mode === "interval" && (
                  <>
                    <View className="mt-3">
                      <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Repeat Every (minutes)</Text>
                      <TextInput
                        value={reminderForm.intervalMinutes}
                        onChangeText={(value) => setReminderForm((prev) => ({ ...prev, intervalMinutes: digitsOnly(value) }))}
                        keyboardType="number-pad"
                        placeholder="60"
                        placeholderTextColor="#7A7A7A"
                        className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                        style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                      />
                    </View>
                    <View className="mt-3 flex-row gap-3">
                      <View className="flex-1">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Start Hour</Text>
                        <TextInput
                          value={reminderForm.intervalStartHour}
                          onChangeText={(value) => setReminderForm((prev) => ({ ...prev, intervalStartHour: digitsOnly(value) }))}
                          keyboardType="number-pad"
                          placeholder="8"
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Start Minute</Text>
                        <TextInput
                          value={reminderForm.intervalStartMinute}
                          onChangeText={(value) => setReminderForm((prev) => ({ ...prev, intervalStartMinute: digitsOnly(value) }))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                        />
                      </View>
                    </View>
                    <View className="mt-3 flex-row gap-3">
                      <View className="flex-1">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">End Hour</Text>
                        <TextInput
                          value={reminderForm.intervalEndHour}
                          onChangeText={(value) => setReminderForm((prev) => ({ ...prev, intervalEndHour: digitsOnly(value) }))}
                          keyboardType="number-pad"
                          placeholder="22"
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="mb-2 text-sm font-semibold text-[#2A6A80] dark:text-white/75">End Minute</Text>
                        <TextInput
                          value={reminderForm.intervalEndMinute}
                          onChangeText={(value) => setReminderForm((prev) => ({ ...prev, intervalEndMinute: digitsOnly(value) }))}
                          keyboardType="number-pad"
                          placeholder="00"
                          placeholderTextColor="#7A7A7A"
                          className="rounded-2xl border px-4 py-3 text-lg font-semibold"
                          style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                        />
                      </View>
                    </View>
                  </>
                )}
                <TextInput
                  value={reminderForm.note}
                  onChangeText={(value) => setReminderForm((prev) => ({ ...prev, note: value }))}
                  multiline
                  placeholder="Note (optional)"
                  placeholderTextColor="#7A7A7A"
                  className="mt-3 min-h-[90px] rounded-2xl border px-4 py-3 text-base text-[#08364A] dark:text-white"
                  style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
                />
                {reminderForm.mode !== "once" && (
                  <>
                    <Text className="mb-2 mt-3 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Days</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {WEEKDAY_OPTIONS.map((day) => {
                        const selected = reminderForm.days.includes(day.value);
                        return (
                          <Pressable
                            key={`rday-${day.value}`}
                            onPress={() => toggleReminderDay(day.value)}
                            className="rounded-full border px-3 py-2"
                            style={{
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
                    <Text className="mt-2 text-xs text-[#4A8FA2] dark:text-white/60">
                      Leave all days off to repeat every day.
                    </Text>
                  </>
                )}
                <Pressable
                  onPress={() => setReminderForm((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  className={`mt-4 rounded-2xl border px-4 py-3 ${
                    reminderForm.enabled
                      ? "border-neon-green/50 bg-neon-green/15"
                      : "border-[#05AED5]/35 dark:border-white/20 bg-ink dark:bg-[#050505]"
                  }`}
                >
                  <Text className={`text-sm font-black uppercase ${reminderForm.enabled ? "text-neon-green" : "text-[#2A6A80] dark:text-white/75"}`}>
                    {reminderForm.enabled ? "Reminder Enabled" : "Reminder Disabled"}
                  </Text>
                </Pressable>
              </ScrollView>
              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setReminderEditorOpen(false)}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{ borderColor: reminderTheme.accentBorder, backgroundColor: inputBackground }}
                >
                  <Text className="text-base font-semibold text-[#2A6A80] dark:text-white/75">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSaveReminder().catch(() => undefined)}
                  className="flex-1 items-center rounded-xl py-3"
                  style={{ backgroundColor: reminderTheme.accent }}
                >
                  <Text className="text-base font-black" style={{ color: reminderTheme.onAccent }}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={vaultEditorOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setVaultEditorOpen(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/70 px-6"
          >
            <View className="rounded-3xl border p-5" style={{ borderColor: passwordTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-2xl font-black" style={{ color: textPrimary }}>{vaultForm.id ? "Edit Password" : "Add Password"}</Text>
              <TextInput
                value={vaultForm.appName}
                onChangeText={(value) => setVaultForm((prev) => ({ ...prev, appName: value }))}
                placeholder="App or website"
                placeholderTextColor="#7A7A7A"
                className="mt-4 rounded-2xl border px-4 py-3 text-lg font-semibold"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              <TextInput
                value={vaultForm.accountId}
                onChangeText={(value) => setVaultForm((prev) => ({ ...prev, accountId: value }))}
                placeholder="Login ID / username"
                placeholderTextColor="#7A7A7A"
                className="mt-3 rounded-2xl border px-4 py-3 text-lg"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              <TextInput
                value={vaultForm.secret}
                onChangeText={(value) => setVaultForm((prev) => ({ ...prev, secret: value }))}
                placeholder="Password"
                placeholderTextColor="#7A7A7A"
                className="mt-3 rounded-2xl border px-4 py-3 text-lg"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setVaultEditorOpen(false)}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground }}
                >
                  <Text className="text-base font-semibold text-[#2A6A80] dark:text-white/75">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleSaveVault().catch(() => undefined)}
                  className="flex-1 items-center rounded-xl py-3"
                  style={{ backgroundColor: passwordTheme.accent }}
                >
                  <Text className="text-base font-black" style={{ color: passwordTheme.onAccent }}>Save</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={pinModalOpen}
          transparent
          animationType="fade"
          onRequestClose={closePinModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/70 px-6"
          >
            <View className="rounded-3xl border p-5" style={{ borderColor: passwordTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-2xl font-black" style={{ color: textPrimary }}>
                {pinModalMode === "unlock" ? "Unlock Password Manager" : "Verify PIN"}
              </Text>
              <Text className="mt-2 text-base text-[#2A6A80] dark:text-white/75">
                {pinModalMode === "unlock" ? "Enter PIN to open vault." : "Enter PIN to reveal password."}
              </Text>
              <TextInput
                value={pinModalInput}
                onChangeText={(value) => {
                  setPinModalInput(digitsOnly(value));
                  if (pinModalError) setPinModalError("");
                }}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                placeholder="PIN"
                placeholderTextColor="#7A7A7A"
                className="mt-4 rounded-2xl border px-4 py-3 text-lg font-semibold"
                style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground, color: textPrimary }}
              />
              {pinModalError.length > 0 && (
                <Text className="mt-2 text-base font-semibold text-neon-red">{pinModalError}</Text>
              )}
              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={closePinModal}
                  className="flex-1 items-center rounded-xl border py-3"
                  style={{ borderColor: passwordTheme.accentBorder, backgroundColor: inputBackground }}
                >
                  <Text className="text-base font-semibold text-[#2A6A80] dark:text-white/75">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => verifyPinModal().catch(() => undefined)}
                  className="flex-1 items-center rounded-xl py-3"
                  style={{ backgroundColor: passwordTheme.accent }}
                >
                  <Text className="text-base font-black" style={{ color: passwordTheme.onAccent }}>Verify</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {showSplashOverlay && (
          <Animated.View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: splashOpacity
            }}
          >
            <View className="flex-1 items-center justify-center px-8" style={{ flex: 1, backgroundColor: appBackground }}>
              <StatusBar style={statusBarStyle} />
              <View className="w-full max-w-[360px] rounded-3xl border px-8 py-10" style={{ borderColor: workoutTheme.accentBorder, backgroundColor: panelBackground }}>
                <View className="items-center">
                  <Image
                    source={require("./assets/icons/icon.png")}
                    className="h-24 w-24 rounded-3xl"
                    resizeMode="cover"
                  />
                  <Text className="mt-5 text-4xl font-black tracking-[4px]" style={{ color: workoutTheme.accent }}>ANTHRA</Text>
                  <Text className="mt-2 text-sm font-semibold uppercase tracking-[2px] text-[#34768B] dark:text-white/70">
                    Personal Planner
                  </Text>
                  <View className="mt-8 items-center">
                    <ActivityIndicator size="large" color={workoutTheme.accent} />
                    <Text className="mt-4 text-xs font-semibold uppercase tracking-[1.5px] text-[#4A8FA2] dark:text-white/60">
                      Crafting...
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </SafeAreaProvider>
  );
}
