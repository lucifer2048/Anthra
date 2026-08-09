import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";

import type {
  DashboardStats,
  ActiveWorkoutSnapshot,
  AlarmCompletionEvent,
  AlarmHistoryEntry,
  AlarmInput,
  AlarmItem,
  ReminderCompletionEntry,
  ReminderInput,
  ReminderItem,
  ReminderTimeSlot,
  Exercise,
  ListBuddyCategory,
  ListBuddyCategoryInput,
  ListBuddyItem,
  ListBuddyItemInput,
  UserProfile,
  UserSettings,
  VaultEntry,
  VaultEntryInput,
  VaultSecuritySettings,
  WorkoutHistoryEntry,
  WorkoutPlan,
  WorkoutPlanInput,
  WorkoutRunSummary,
  WorkoutSection
} from "../types";
import { normalizeDays, parseDays, serializeDays } from "../constants/schedule";
import { addDays, startOfWeekMonday } from "../utils/date";
import { getDeviceTimeZone } from "../utils/timezone";
import {
  isSupportedAnthraBackupVersion,
  normalizeLegacyBackupTables
} from "./backupCompatibility";
import { TRACKER_MIGRATIONS } from "../features/tracker/trackerSchema";
import {
  ACTIVITY_MIGRATIONS,
  ACTIVITY_TABLE_NAMES
} from "../features/activity/activitySchema";
import {
  NUTRITION_MIGRATIONS,
  NUTRITION_TABLE_NAMES
} from "../features/nutrition/nutritionSchema";
import { SOCIAL_CACHE_MIGRATIONS } from "../features/social/socialSchema";
import { MAX_LIST_ITEM_LENGTH, MAX_LIST_NAME_LENGTH } from "../constants/listBuddy";

const SQLiteAny = SQLite as unknown as Record<string, unknown>;
const legacyDb =
  typeof SQLiteAny.openDatabase === "function"
    ? (SQLiteAny.openDatabase as (name: string) => unknown)("anthra.db")
    : null;
const modernDb =
  !legacyDb && typeof SQLiteAny.openDatabaseSync === "function"
    ? (SQLiteAny.openDatabaseSync as (name: string) => unknown)("anthra.db")
    : null;

const META_STREAK = "current_streak";
const META_MARKER = "streak_marker_week_start";
const META_PLAN_DRAFT = "plan_editor_draft_v1";
const META_HUB_APP_THEME_COLORS = "hub_app_theme_colors_v1";
const META_APP_THEME_MODE = "app_theme_mode_v1";
const META_ACTIVE_WORKOUT = "active_workout_snapshot_v1";
const DEFAULT_WEEKLY_GOAL = 4;
const DEFAULT_WORKOUT_DAYS = [1, 3, 5];
const DEFAULT_REMINDER_HOUR = 18;
const DEFAULT_REMINDER_MINUTE = 0;
const DEFAULT_REMINDER_LEAD_MINUTES = 60;
const DEFAULT_REMINDER_BUDDY_TIMEZONE = getDeviceTimeZone();
const ALARM_TIMEZONE = "Asia/Kolkata" as const;
const VAULT_KEY = "anthra-vault-key-v1";
const VAULT_PIN_SALT = "anthra-vault-pin-salt-v1";
const VAULT_SECURE_STORE_SENTINEL = "secure-store-v1";
const VAULT_SECURE_STORE_PREFIX = "anthra.vault.secret";
const VAULT_SECURE_STORE_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
} as const;

type QueryValue = string | number | null;
type QueryResult = {
  rows: Record<string, unknown>[];
  insertId?: number;
};

export type AnthraBackup = {
  format: "anthra-backup";
  version: 1 | 2 | 3 | 4 | 5 | 6;
  createdAt: number;
  appDataNotice: string;
  tables: Record<string, Record<string, QueryValue>[]>;
};

const BACKUP_TABLES: Array<{ name: string; columns: string[] }> = [
  { name: "plans", columns: ["id", "name", "loops", "workoutDays", "createdAt"] },
  { name: "plan_sections", columns: ["id", "planId", "name", "loops", "restSeconds", "sortOrder"] },
  { name: "exercises", columns: ["id", "planId", "sectionId", "name", "workSeconds", "restSeconds", "sortOrder"] },
  { name: "workout_logs", columns: ["id", "completedAt", "planId"] },
  { name: "workout_sessions", columns: ["id", "planId", "planName", "startedAt", "endedAt", "progressPercent", "completedSegments", "totalSegments", "elapsedSeconds", "completed", "rating", "comment"] },
  { name: "user_profile", columns: ["id", "heightCm", "weightKg", "goal"] },
  { name: "user_settings", columns: ["id", "workoutDays", "weeklyGoal", "reminderHour", "reminderMinute", "reminderLeadMinutes", "reminderLeadMinutesCsv", "notificationsEnabled", "reminderDelivery", "timezone"] },
  { name: "meta", columns: ["key", "value"] },
  { name: "reminders", columns: ["id", "title", "note", "mode", "hour", "minute", "dateLabel", "daysCsv", "timeSlotsCsv", "intervalMinutes", "intervalStartHour", "intervalStartMinute", "intervalEndHour", "intervalEndMinute", "enabled", "timezone", "createdAt", "updatedAt"] },
  { name: "reminder_completion_logs", columns: ["id", "reminderId", "occurrenceTs", "completedAt"] },
  { name: "alarms", columns: ["id", "label", "hour", "minute", "daysCsv", "pushupTarget", "soundUri", "soundName", "enabled", "timezone", "createdAt", "updatedAt"] },
  { name: "alarm_logs", columns: ["id", "eventId", "alarmId", "label", "firedAt", "completedAt", "targetReps", "completedReps", "status"] },
  { name: "list_categories", columns: ["id", "name", "createdAt", "updatedAt"] },
  { name: "list_items", columns: ["id", "categoryId", "text", "completed", "sortOrder", "createdAt", "updatedAt"] },
  { name: "tracker_buddy_trackers", columns: ["id", "name", "createdDate", "archivedAt", "createdAt", "updatedAt"] },
  { name: "tracker_buddy_tasks", columns: ["id", "trackerId", "archivedAt", "createdAt", "updatedAt"] },
  { name: "tracker_buddy_task_versions", columns: ["id", "taskId", "title", "recurrence", "daysCsv", "onceDate", "notificationEnabled", "notificationHour", "notificationMinute", "timezone", "validFrom", "validTo", "sortOrder", "createdAt", "updatedAt"] },
  { name: "tracker_buddy_completions", columns: ["id", "taskId", "versionId", "dateKey", "completedAt"] },
  { name: "activity_settings", columns: ["id", "dailyGoal", "phoneTrackingEnabled", "shareScope", "updatedAt"] },
  { name: "activity_daily_summary", columns: ["dateKey", "timezone", "phoneSteps", "healthConnectSteps", "authoritativeSteps", "authoritativeSource", "sourcePackagesCsv", "updatedAt"] },
  { name: "activity_workouts", columns: ["id", "source", "originPackage", "externalId", "clientRecordId", "clientRecordVersion", "title", "exerciseType", "startTime", "endTime", "durationSeconds", "dateKey", "timezone", "lastModifiedTime", "importedAt"] },
  { name: "activity_sources", columns: ["packageName", "sourceType", "displayName", "lastSeenAt"] },
  { name: "activity_sync_state", columns: ["syncKey", "lastAttemptAt", "lastSuccessAt", "error"] },
  { name: "step_sensor_checkpoints", columns: ["dateKey", "timezone", "baselineRaw", "lastRaw", "steps", "counterReset", "rebootDetected", "updatedAt"] }
  ,{ name: "nutrition_goals", columns: ["id", "ownerId", "calorieGoal", "proteinGoalGrams", "carbohydrateGoalGrams", "fatGoalGrams", "fibreGoalGrams", "syncState", "createdAt", "updatedAt", "deletedAt"] }
  ,{ name: "nutrition_entries", columns: ["id", "ownerId", "mealType", "source", "consumedAt", "localDate", "timezone", "imageReference", "imageMime", "analyzerProvider", "analyzerModel", "analyzerRequestId", "confidence", "syncState", "createdAt", "updatedAt", "deletedAt"] }
  ,{ name: "nutrition_entry_items", columns: ["id", "entryId", "foodId", "name", "servingQuantity", "servingUnit", "servingGrams", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fibreGrams", "sugarGrams", "sodiumMilligrams", "nutrientSource", "nutrientSourceRef", "servingAssumption", "confidence", "sortOrder", "createdAt", "updatedAt", "deletedAt"] }
  ,{ name: "nutrition_custom_foods", columns: ["id", "ownerId", "name", "category", "barcode", "servingQuantity", "servingUnit", "servingGrams", "calories", "proteinGrams", "carbohydrateGrams", "fatGrams", "fibreGrams", "sugarGrams", "sodiumMilligrams", "nutrientSource", "nutrientSourceRef", "servingAssumption", "syncState", "createdAt", "updatedAt", "deletedAt"] }
  ,{ name: "nutrition_sync_queue", columns: ["resourceType", "resourceId", "operation", "attempts", "nextAttemptAt", "lastError", "createdAt", "updatedAt"] }
];

function sqlLooksLikeSelect(sql: string): boolean {
  return /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql);
}

async function runQuery(sql: string, params: QueryValue[] = []): Promise<QueryResult> {
  if (legacyDb) {
    const db = legacyDb as {
      transaction: (
        callback: (tx: {
          executeSql: (
            query: string,
            values: QueryValue[],
            success: (_: unknown, result: unknown) => void,
            error: (_: unknown, error: unknown) => boolean
          ) => void;
        }) => void,
        error: (error: unknown) => void
      ) => void;
    };

    return new Promise((resolve, reject) => {
      db.transaction(
        (tx) => {
          tx.executeSql(
            sql,
            params,
            (_, result) => {
              const rowSet = result as {
                rows: { length: number; item: (index: number) => Record<string, unknown> };
                insertId?: number;
              };
              const rows: Record<string, unknown>[] = [];
              for (let i = 0; i < rowSet.rows.length; i += 1) {
                rows.push(rowSet.rows.item(i));
              }
              resolve({ rows, insertId: rowSet.insertId });
            },
            (_, error) => {
              reject(error);
              return false;
            }
          );
        },
        (error) => reject(error)
      );
    });
  }

  if (modernDb) {
    const db = modernDb as {
      getAllAsync: (query: string, ...values: QueryValue[]) => Promise<Record<string, unknown>[]>;
      runAsync: (
        query: string,
        ...values: QueryValue[]
      ) => Promise<{ lastInsertRowId?: number; changes: number }>;
    };

    if (sqlLooksLikeSelect(sql)) {
      const rows = await db.getAllAsync(sql, ...params);
      return { rows };
    }

    const result = await db.runAsync(sql, ...params);
    return { rows: [], insertId: result.lastInsertRowId };
  }

  throw new Error("SQLite is not available in this environment.");
}

function mapRows<T>(result: QueryResult): T[] {
  return result.rows as T[];
}

function normalizeReminderLeadMinutes(values: number[]): number[] {
  const normalized = values
    .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));
  const deduped = Array.from(new Set(normalized));
  deduped.sort((a, b) => b - a);
  return deduped.slice(0, 3);
}

function parseReminderLeadMinutes(
  csv: string | null | undefined,
  legacyValue?: number | null
): number[] {
  const parsedFromCsv =
    csv && csv.trim().length > 0
      ? csv
          .split(",")
          .map((token) => Number(token.trim()))
          .filter((value) => Number.isFinite(value))
      : [];

  if (parsedFromCsv.length > 0) {
    const normalized = normalizeReminderLeadMinutes(parsedFromCsv);
    if (normalized.length > 0) return normalized;
  }

  const fallback = Math.max(
    0,
    Math.floor(Number(legacyValue == null ? DEFAULT_REMINDER_LEAD_MINUTES : legacyValue) || 0)
  );
  return [fallback];
}

function serializeReminderLeadMinutes(values: number[]): string {
  const normalized = normalizeReminderLeadMinutes(values);
  const fallback = normalized.length > 0 ? normalized : [DEFAULT_REMINDER_LEAD_MINUTES];
  return fallback.join(",");
}

function clampHour(value: number | null | undefined, fallback = 9): number {
  return Math.min(23, Math.max(0, Math.floor(Number(value) || fallback)));
}

function clampMinute(value: number | null | undefined, fallback = 0): number {
  return Math.min(59, Math.max(0, Math.floor(Number(value) || fallback)));
}

function normalizeReminderMode(raw: unknown): "time" | "interval" | "multi" | "once" {
  const value = String(raw);
  if (value === "interval" || value === "multi" || value === "once") {
    return value;
  }
  return "time";
}

function normalizeReminderInterval(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Math.floor(Number(value) || 0);
  if (!Number.isFinite(parsed) || parsed < 5 || parsed > 720) return null;
  return parsed;
}

function normalizeReminderDateLabel(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeReminderTimeSlots(timeSlots: ReminderTimeSlot[]): ReminderTimeSlot[] {
  const normalized = timeSlots
    .map((slot) => ({
      hour: clampHour(slot?.hour, 0),
      minute: clampMinute(slot?.minute, 0)
    }))
    .filter(
      (slot, index, array) =>
        array.findIndex((candidate) => candidate.hour === slot.hour && candidate.minute === slot.minute) === index
    );

  normalized.sort((left, right) => left.hour * 60 + left.minute - (right.hour * 60 + right.minute));
  return normalized.slice(0, 4);
}

function parseReminderTimeSlots(csv: string | null | undefined): ReminderTimeSlot[] {
  const raw = String(csv ?? "").trim();
  if (!raw) return [];

  const slots: ReminderTimeSlot[] = [];
  for (const token of raw.split(",")) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(token.trim());
    if (!match) continue;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
      continue;
    }
    slots.push({ hour, minute });
  }

  return normalizeReminderTimeSlots(slots);
}

function serializeReminderTimeSlots(timeSlots: ReminderTimeSlot[]): string {
  return normalizeReminderTimeSlots(timeSlots)
    .map((slot) => `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`)
    .join(",");
}

function toDigitOnlyPin(value: string): string {
  return String(value).replace(/[^0-9]/g, "");
}

function assertValidPin(pin: string): string {
  const normalized = toDigitOnlyPin(pin);
  if (normalized.length < 4 || normalized.length > 8) {
    throw new Error("PIN must be 4 to 8 digits.");
  }
  return normalized;
}

function hashPin(pin: string): string {
  const payload = `${VAULT_PIN_SALT}:${pin}`;
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function decodeSecret(encoded: string): string {
  const key = VAULT_KEY;
  if (encoded.length % 4 !== 0) return "";
  let decoded = "";
  for (let cursor = 0; cursor < encoded.length; cursor += 4) {
    const chunk = encoded.slice(cursor, cursor + 4);
    const cipher = Number.parseInt(chunk, 16);
    if (!Number.isFinite(cipher)) return "";
    const keyCode = key.charCodeAt((cursor / 4) % key.length);
    decoded += String.fromCharCode(cipher ^ keyCode);
  }
  return decoded;
}

function getVaultSecretStorageKey(entryId: number): string {
  return `${VAULT_SECURE_STORE_PREFIX}.${entryId}`;
}

async function canUseSecureVaultStorage(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

async function readVaultSecret(entryId: number, secretCipher: string): Promise<string> {
  if (await canUseSecureVaultStorage()) {
    const storageKey = getVaultSecretStorageKey(entryId);
    const secureValue = await SecureStore.getItemAsync(storageKey).catch(() => null);
    if (secureValue != null) return secureValue;

    if (secretCipher !== VAULT_SECURE_STORE_SENTINEL) {
      const legacyValue = decodeSecret(secretCipher);
      if (legacyValue) {
        try {
          await SecureStore.setItemAsync(storageKey, legacyValue, VAULT_SECURE_STORE_OPTIONS);
          await runQuery("UPDATE vault_entries SET secretCipher = ? WHERE id = ?;", [
            VAULT_SECURE_STORE_SENTINEL,
            entryId
          ]);
        } catch {
          // The legacy value remains readable and untouched; migration can retry later.
        }
      }
      return legacyValue;
    }
  }

  if (secretCipher === VAULT_SECURE_STORE_SENTINEL) {
    throw new Error("Secure vault data is unavailable on this device. No password data was changed.");
  }

  return decodeSecret(secretCipher);
}

async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  const result = await runQuery(`PRAGMA table_info(${tableName});`);
  return result.rows.some((row) => String(row.name) === columnName);
}

async function getMeta(key: string): Promise<string | null> {
  const result = await runQuery("SELECT value FROM meta WHERE key = ? LIMIT 1;", [key]);
  if (result.rows.length === 0) return null;
  return String(result.rows[0].value);
}

async function setMeta(key: string, value: string): Promise<void> {
  await runQuery("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?);", [key, value]);
}

async function countWorkoutDaysInRange(startMs: number, endMs: number): Promise<number> {
  const result = await runQuery(
    `
      SELECT COUNT(DISTINCT strftime('%Y-%m-%d', completedAt / 1000, 'unixepoch', 'localtime')) AS total
      FROM workout_logs
      WHERE completedAt >= ? AND completedAt < ?;
    `,
    [startMs, endMs]
  );
  return Number(result.rows[0]?.total ?? 0);
}

type WorkoutLifetimeSummary = {
  bestStreak: number;
  totalWorkouts: number;
};

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getWorkoutLifetimeSummary(
  weeklyGoal: number,
  currentWeekStart: number,
  currentStreak: number
): Promise<WorkoutLifetimeSummary> {
  const result = await runQuery("SELECT completedAt FROM workout_logs ORDER BY completedAt ASC;");
  const workoutsByWeek = new Map<number, Set<string>>();

  for (const row of result.rows) {
    const completedAt = Number(row.completedAt);
    if (!Number.isFinite(completedAt)) continue;

    const weekStart = startOfWeekMonday(new Date(completedAt)).getTime();
    const workoutDays = workoutsByWeek.get(weekStart) ?? new Set<string>();
    workoutDays.add(localDateKey(completedAt));
    workoutsByWeek.set(weekStart, workoutDays);
  }

  const goal = Math.max(1, Math.floor(Number(weeklyGoal) || DEFAULT_WEEKLY_GOAL));
  const sortedWeeks = [...workoutsByWeek.entries()]
    .filter(([weekStart]) => weekStart <= currentWeekStart)
    .sort(([left], [right]) => left - right);

  let bestStreak = 0;
  let runningStreak = 0;
  let previousWeekStart: number | null = null;

  for (const [weekStart, workoutDays] of sortedWeeks) {
    const isConsecutiveWeek =
      previousWeekStart == null || weekStart - previousWeekStart <= 8 * 24 * 60 * 60 * 1000;
    if (!isConsecutiveWeek) runningStreak = 0;

    const completedDays = workoutDays.size;
    if (weekStart === currentWeekStart) {
      // The current week remains part of an active streak while the goal is in progress.
      runningStreak += completedDays;
    } else if (completedDays >= goal) {
      runningStreak += completedDays;
    } else {
      runningStreak = 0;
    }

    bestStreak = Math.max(bestStreak, runningStreak);
    previousWeekStart = weekStart;
  }

  return {
    bestStreak: Math.max(bestStreak, currentStreak),
    totalWorkouts: result.rows.length
  };
}

async function backfillLegacySections(): Promise<void> {
  const plansResult = await runQuery("SELECT id, loops FROM plans;");
  const plans = mapRows<{ id: number; loops: number }>(plansResult);

  for (const plan of plans) {
    const sectionCountResult = await runQuery(
      "SELECT COUNT(*) AS total FROM plan_sections WHERE planId = ?;",
      [plan.id]
    );
    const hasSections = Number(sectionCountResult.rows[0]?.total ?? 0) > 0;
    if (hasSections) continue;

    const insertResult = await runQuery(
      "INSERT INTO plan_sections (planId, name, loops, restSeconds, sortOrder) VALUES (?, ?, ?, ?, ?);",
      [plan.id, "Main", Math.max(1, Number(plan.loops) || 1), 0, 0]
    );
    const sectionId = Number(insertResult.insertId);
    if (!sectionId) continue;

    await runQuery("UPDATE exercises SET sectionId = ? WHERE planId = ? AND sectionId IS NULL;", [
      sectionId,
      plan.id
    ]);
  }
}

export async function initDatabase(): Promise<void> {
  await runQuery("PRAGMA foreign_keys = ON;");
  await runQuery(`
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      loops INTEGER NOT NULL DEFAULT 1,
      workoutDays TEXT NOT NULL DEFAULT '',
      createdAt INTEGER NOT NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS plan_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planId INTEGER NOT NULL,
      name TEXT NOT NULL,
      loops INTEGER NOT NULL DEFAULT 1,
      restSeconds INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL,
      FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE CASCADE
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planId INTEGER NOT NULL,
      sectionId INTEGER,
      name TEXT NOT NULL,
      workSeconds INTEGER NOT NULL,
      restSeconds INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE CASCADE,
      FOREIGN KEY (sectionId) REFERENCES plan_sections(id) ON DELETE SET NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      completedAt INTEGER NOT NULL,
      planId INTEGER,
      FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE SET NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planId INTEGER,
      planName TEXT NOT NULL,
      startedAt INTEGER NOT NULL,
      endedAt INTEGER,
      progressPercent REAL NOT NULL DEFAULT 0,
      completedSegments INTEGER NOT NULL DEFAULT 0,
      totalSegments INTEGER NOT NULL DEFAULT 0,
      elapsedSeconds INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      rating INTEGER,
      comment TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (planId) REFERENCES plans(id) ON DELETE SET NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      heightCm REAL,
      weightKg REAL,
      goal TEXT NOT NULL DEFAULT ''
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workoutDays TEXT NOT NULL DEFAULT '',
      weeklyGoal INTEGER NOT NULL DEFAULT 4,
      reminderHour INTEGER NOT NULL DEFAULT 18,
      reminderMinute INTEGER NOT NULL DEFAULT 0,
      reminderLeadMinutes INTEGER NOT NULL DEFAULT 60,
      reminderLeadMinutesCsv TEXT NOT NULL DEFAULT '60',
      notificationsEnabled INTEGER NOT NULL DEFAULT 0,
      reminderDelivery TEXT NOT NULL DEFAULT 'notification',
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'time',
      hour INTEGER NOT NULL DEFAULT 9,
      minute INTEGER NOT NULL DEFAULT 0,
      dateLabel TEXT,
      daysCsv TEXT NOT NULL DEFAULT '',
      timeSlotsCsv TEXT NOT NULL DEFAULT '',
      intervalMinutes INTEGER,
      intervalStartHour INTEGER,
      intervalStartMinute INTEGER,
      intervalEndHour INTEGER,
      intervalEndMinute INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS reminder_completion_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reminderId INTEGER NOT NULL,
      occurrenceTs INTEGER NOT NULL,
      completedAt INTEGER NOT NULL,
      UNIQUE(reminderId, occurrenceTs),
      FOREIGN KEY (reminderId) REFERENCES reminders(id) ON DELETE CASCADE
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS alarms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      hour INTEGER NOT NULL,
      minute INTEGER NOT NULL,
      daysCsv TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
      pushupTarget INTEGER NOT NULL DEFAULT 10,
      soundUri TEXT NOT NULL DEFAULT '',
      soundName TEXT NOT NULL DEFAULT 'System alarm',
      enabled INTEGER NOT NULL DEFAULT 1,
      timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS alarm_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eventId TEXT NOT NULL UNIQUE,
      alarmId INTEGER,
      label TEXT NOT NULL,
      firedAt INTEGER NOT NULL,
      completedAt INTEGER NOT NULL,
      targetReps INTEGER NOT NULL,
      completedReps INTEGER NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (alarmId) REFERENCES alarms(id) ON DELETE SET NULL
    );
  `);
  await runQuery(`
    DELETE FROM reminder_completion_logs
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM reminder_completion_logs
      GROUP BY reminderId, occurrenceTs
    );
  `);
  await runQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_completion_occurrence
    ON reminder_completion_logs(reminderId, occurrenceTs);
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS vault_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appName TEXT NOT NULL,
      accountId TEXT NOT NULL,
      secretCipher TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS vault_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pinHash TEXT NOT NULL DEFAULT '',
      biometricsEnabled INTEGER NOT NULL DEFAULT 0
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS list_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);
  await runQuery(`
    CREATE TABLE IF NOT EXISTS list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoryId INTEGER NOT NULL,
      text TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY (categoryId) REFERENCES list_categories(id) ON DELETE CASCADE
    );
  `);
  for (const migration of TRACKER_MIGRATIONS) {
    await runQuery(migration);
  }
  for (const migration of ACTIVITY_MIGRATIONS) {
    await runQuery(migration);
  }
  for (const migration of NUTRITION_MIGRATIONS) {
    await runQuery(migration);
  }
  for (const migration of SOCIAL_CACHE_MIGRATIONS) {
    await runQuery(migration);
  }

  if (!(await hasColumn("plans", "workoutDays"))) {
    await runQuery("ALTER TABLE plans ADD COLUMN workoutDays TEXT NOT NULL DEFAULT '';");
  }

  if (!(await hasColumn("exercises", "sectionId"))) {
    await runQuery("ALTER TABLE exercises ADD COLUMN sectionId INTEGER;");
  }

  if (!(await hasColumn("workout_sessions", "rating"))) {
    await runQuery("ALTER TABLE workout_sessions ADD COLUMN rating INTEGER;");
  }

  if (!(await hasColumn("workout_sessions", "comment"))) {
    await runQuery("ALTER TABLE workout_sessions ADD COLUMN comment TEXT NOT NULL DEFAULT '';");
  }

  if (!(await hasColumn("user_settings", "reminderLeadMinutesCsv"))) {
    await runQuery("ALTER TABLE user_settings ADD COLUMN reminderLeadMinutesCsv TEXT NOT NULL DEFAULT '60';");
    await runQuery(
      "UPDATE user_settings SET reminderLeadMinutesCsv = CAST(reminderLeadMinutes AS TEXT) WHERE reminderLeadMinutesCsv = '60';"
    );
  }

  if (!(await hasColumn("user_settings", "timezone"))) {
    await runQuery("ALTER TABLE user_settings ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';");
  }

  if (!(await hasColumn("user_settings", "reminderDelivery"))) {
    await runQuery("ALTER TABLE user_settings ADD COLUMN reminderDelivery TEXT NOT NULL DEFAULT 'notification';");
  }

  if (!(await hasColumn("reminders", "timezone"))) {
    await runQuery(
      `ALTER TABLE reminders ADD COLUMN timezone TEXT NOT NULL DEFAULT '${DEFAULT_REMINDER_BUDDY_TIMEZONE}';`
    );
  }

  if (!(await hasColumn("reminders", "dateLabel"))) {
    await runQuery("ALTER TABLE reminders ADD COLUMN dateLabel TEXT;");
  }

  if (!(await hasColumn("reminders", "timeSlotsCsv"))) {
    await runQuery("ALTER TABLE reminders ADD COLUMN timeSlotsCsv TEXT NOT NULL DEFAULT '';");
  }

  await runQuery(
    `
      INSERT OR IGNORE INTO user_settings (
        id,
        workoutDays,
        weeklyGoal,
        reminderHour,
        reminderMinute,
        reminderLeadMinutes,
        reminderLeadMinutesCsv,
        notificationsEnabled,
        reminderDelivery,
        timezone
      ) VALUES (1, ?, ?, ?, ?, ?, ?, 0, 'notification', ?);
    `,
    [
      serializeDays(DEFAULT_WORKOUT_DAYS),
      DEFAULT_WEEKLY_GOAL,
      DEFAULT_REMINDER_HOUR,
      DEFAULT_REMINDER_MINUTE,
      DEFAULT_REMINDER_LEAD_MINUTES,
      String(DEFAULT_REMINDER_LEAD_MINUTES),
      getDeviceTimeZone()
    ]
  );

  await runQuery("INSERT OR IGNORE INTO vault_settings (id, pinHash, biometricsEnabled) VALUES (1, '', 0);");

  await backfillLegacySections();
}

export async function getPlans(): Promise<WorkoutPlan[]> {
  const plansResult = await runQuery("SELECT * FROM plans ORDER BY createdAt DESC;");
  const plans = mapRows<{
    id: number;
    name: string;
    loops: number;
    workoutDays?: string | null;
    createdAt: number;
  }>(plansResult);

  const hydrated: WorkoutPlan[] = [];
  for (const plan of plans) {
    const sectionsResult = await runQuery(
      "SELECT id, name, loops, restSeconds, sortOrder FROM plan_sections WHERE planId = ? ORDER BY sortOrder ASC;",
      [plan.id]
    );
    const sectionRows = mapRows<{
      id: number;
      name: string;
      loops: number;
      restSeconds: number;
      sortOrder: number;
    }>(sectionsResult);

    const exercisesResult = await runQuery(
      "SELECT id, sectionId, name, workSeconds, restSeconds, sortOrder FROM exercises WHERE planId = ? ORDER BY sortOrder ASC;",
      [plan.id]
    );
    const exerciseRows = mapRows<{
      id: number;
      sectionId: number | null;
      name: string;
      workSeconds: number;
      restSeconds: number;
      sortOrder: number;
    }>(exercisesResult);

    const sections: WorkoutSection[] =
      sectionRows.length > 0
        ? sectionRows.map((section) => ({
            id: Number(section.id),
            name: String(section.name),
            loops: Math.max(1, Number(section.loops) || 1),
            restSeconds: Math.max(0, Number(section.restSeconds) || 0),
            exercises: []
          }))
        : [
            {
              name: "Main",
              loops: Math.max(1, Number(plan.loops) || 1),
              restSeconds: 0,
              exercises: []
            }
          ];

    const sectionById = new Map<number, WorkoutSection>();
    sections.forEach((section) => {
      if (section.id) {
        sectionById.set(section.id, section);
      }
    });

    const flatExercises: Exercise[] = [];
    for (const row of exerciseRows) {
      const exercise: Exercise = {
        id: Number(row.id),
        name: String(row.name),
        workSeconds: Math.max(1, Number(row.workSeconds) || 1),
        restSeconds: Math.max(0, Number(row.restSeconds) || 0)
      };
      flatExercises.push(exercise);

      const targetSection =
        (row.sectionId ? sectionById.get(Number(row.sectionId)) : undefined) ?? sections[0];
      targetSection.exercises.push(exercise);
    }

    const sectionsWithExercises = sections.filter((section) => section.exercises.length > 0);
    const normalizedSections =
      sectionsWithExercises.length > 0
        ? sectionsWithExercises
        : [
            {
              name: "Main",
              loops: Math.max(1, Number(plan.loops) || 1),
              restSeconds: 0,
              exercises: flatExercises
            }
          ];

    hydrated.push({
      id: Number(plan.id),
      name: String(plan.name),
      loops: Math.max(1, Number(plan.loops) || 1),
      workoutDays: parseDays(plan.workoutDays),
      createdAt: Number(plan.createdAt),
      exercises: flatExercises,
      sections: normalizedSections
    });
  }

  return hydrated;
}

export async function savePlan(plan: WorkoutPlanInput): Promise<number> {
  const cleanName = plan.name.trim();
  if (!cleanName) {
    throw new Error("Plan name cannot be empty.");
  }

  const rawSections =
    plan.sections.length > 0
      ? plan.sections
      : [
          {
            name: "Main",
            loops: Math.max(1, plan.loops),
            restSeconds: 0,
            exercises: plan.exercises
          }
        ];

  const normalizedSections = rawSections
    .map((section, sectionIndex) => ({
      name: section.name.trim() || `Set ${sectionIndex + 1}`,
      loops: Math.max(1, Number(section.loops) || 1),
      restSeconds: Math.max(0, Number(section.restSeconds) || 0),
      exercises: section.exercises
        .map((exercise) => ({
          id: exercise.id,
          name: exercise.name.trim(),
          workSeconds: Math.max(1, Number(exercise.workSeconds) || 1),
          restSeconds: Math.max(0, Number(exercise.restSeconds) || 0)
        }))
        .filter((exercise) => exercise.name.length > 0)
    }))
    .filter((section) => section.exercises.length > 0);

  if (normalizedSections.length === 0) {
    throw new Error("A plan needs at least one exercise.");
  }

  let planId = plan.id;
  const normalizedPlanDays = serializeDays(plan.workoutDays ?? []);
  if (planId) {
    await runQuery("UPDATE plans SET name = ?, loops = ?, workoutDays = ? WHERE id = ?;", [
      cleanName,
      1,
      normalizedPlanDays,
      planId
    ]);
    await runQuery("DELETE FROM exercises WHERE planId = ?;", [planId]);
    await runQuery("DELETE FROM plan_sections WHERE planId = ?;", [planId]);
  } else {
    const insertResult = await runQuery(
      "INSERT INTO plans (name, loops, workoutDays, createdAt) VALUES (?, ?, ?, ?);",
      [cleanName, 1, normalizedPlanDays, Date.now()]
    );
    planId = Number(insertResult.insertId);
  }

  if (!planId) {
    throw new Error("Could not save plan.");
  }

  let globalExerciseSortOrder = 0;
  for (let sectionIndex = 0; sectionIndex < normalizedSections.length; sectionIndex += 1) {
    const section = normalizedSections[sectionIndex];
    const sectionInsert = await runQuery(
      "INSERT INTO plan_sections (planId, name, loops, restSeconds, sortOrder) VALUES (?, ?, ?, ?, ?);",
      [planId, section.name, section.loops, section.restSeconds, sectionIndex]
    );
    const sectionId = Number(sectionInsert.insertId);
    if (!sectionId) {
      throw new Error("Could not save plan section.");
    }

    for (const exercise of section.exercises) {
      await runQuery(
        "INSERT INTO exercises (planId, sectionId, name, workSeconds, restSeconds, sortOrder) VALUES (?, ?, ?, ?, ?, ?);",
        [
          planId,
          sectionId,
          exercise.name,
          exercise.workSeconds,
          exercise.restSeconds,
          globalExerciseSortOrder
        ]
      );
      globalExerciseSortOrder += 1;
    }
  }

  return planId;
}

export async function deletePlan(planId: number): Promise<void> {
  await runQuery("DELETE FROM plans WHERE id = ?;", [planId]);
}

export async function logWorkoutCompletion(planId: number): Promise<void> {
  await runQuery("INSERT INTO workout_logs (completedAt, planId) VALUES (?, ?);", [Date.now(), planId]);
}

export async function startWorkoutSession(planId: number, planName: string): Promise<number> {
  const insertResult = await runQuery(
    "INSERT INTO workout_sessions (planId, planName, startedAt) VALUES (?, ?, ?);",
    [planId, planName, Date.now()]
  );

  const sessionId = Number(insertResult.insertId);
  if (!sessionId) {
    throw new Error("Could not start workout session.");
  }
  return sessionId;
}

export async function finalizeWorkoutSession(
  sessionId: number,
  summary: WorkoutRunSummary
): Promise<void> {
  const endedAt = Date.now();
  const progressPercent = Math.min(100, Math.max(0, Number(summary.progressPercent) || 0));
  const completedSegments = Math.max(0, Number(summary.completedSegments) || 0);
  const totalSegments = Math.max(0, Number(summary.totalSegments) || 0);
  const elapsedSeconds = Math.max(0, Number(summary.elapsedSeconds) || 0);
  const completed = summary.completed ? 1 : 0;

  await runQuery(
    `
      UPDATE workout_sessions
      SET
        endedAt = CASE WHEN endedAt IS NULL THEN ? ELSE endedAt END,
        progressPercent = CASE WHEN progressPercent > ? THEN progressPercent ELSE ? END,
        completedSegments = CASE WHEN completedSegments > ? THEN completedSegments ELSE ? END,
        totalSegments = CASE WHEN totalSegments > ? THEN totalSegments ELSE ? END,
        elapsedSeconds = CASE WHEN elapsedSeconds > ? THEN elapsedSeconds ELSE ? END,
        completed = CASE WHEN completed = 1 OR ? = 1 THEN 1 ELSE 0 END
      WHERE id = ?;
    `,
    [
      endedAt,
      progressPercent,
      progressPercent,
      completedSegments,
      completedSegments,
      totalSegments,
      totalSegments,
      elapsedSeconds,
      elapsedSeconds,
      completed,
      sessionId
    ]
  );
}

export async function getWorkoutHistory(limit = 30): Promise<WorkoutHistoryEntry[]> {
  const result = await runQuery(
    `
      SELECT
        id,
        planId,
        planName,
        startedAt,
        endedAt,
        progressPercent,
        completedSegments,
        totalSegments,
        elapsedSeconds,
        completed,
        rating,
        comment
      FROM workout_sessions
      ORDER BY startedAt DESC
      LIMIT ?;
    `,
    [Math.max(1, limit)]
  );

  return mapRows<{
    id: number;
    planId: number | null;
    planName: string;
    startedAt: number;
    endedAt: number | null;
    progressPercent: number;
    completedSegments: number;
    totalSegments: number;
    elapsedSeconds: number;
    completed: number;
    rating: number | null;
    comment: string | null;
  }>(result).map((row) => {
    const rawRating = row.rating == null ? null : Math.floor(Number(row.rating));
    const rating =
      rawRating != null && Number.isFinite(rawRating) && rawRating >= 1 ? Math.min(5, rawRating) : null;

    return {
      id: Number(row.id),
      planId: row.planId == null ? null : Number(row.planId),
      planName: String(row.planName),
      startedAt: Number(row.startedAt),
      endedAt: row.endedAt == null ? null : Number(row.endedAt),
      progressPercent: Math.min(100, Math.max(0, Number(row.progressPercent) || 0)),
      completedSegments: Math.max(0, Number(row.completedSegments) || 0),
      totalSegments: Math.max(0, Number(row.totalSegments) || 0),
      elapsedSeconds: Math.max(0, Number(row.elapsedSeconds) || 0),
      completed: Number(row.completed) === 1,
      rating,
      comment: String(row.comment ?? "")
    };
  });
}

export async function getCompletedWorkoutCountInRange(
  startTimestamp: number,
  endTimestamp: number
): Promise<number> {
  const result = await runQuery(
    `SELECT COUNT(*) AS total
     FROM workout_sessions
     WHERE completed = 1
       AND COALESCE(endedAt, startedAt) >= ?
       AND COALESCE(endedAt, startedAt) < ?;`,
    [startTimestamp, endTimestamp]
  );
  return Math.max(0, Number(result.rows[0]?.total ?? 0));
}

export async function deleteWorkoutSession(sessionId: number): Promise<void> {
  await runQuery("DELETE FROM workout_sessions WHERE id = ?;", [sessionId]);
}

export async function saveWorkoutSessionFeedback(
  sessionId: number,
  rating: number,
  comment: string
): Promise<void> {
  const normalizedRating = Math.max(1, Math.min(5, Math.floor(Number(rating) || 0)));
  const normalizedComment = comment.trim().slice(0, 400);
  await runQuery("UPDATE workout_sessions SET rating = ?, comment = ? WHERE id = ?;", [
    normalizedRating,
    normalizedComment,
    sessionId
  ]);
}

export async function getActiveWorkoutSnapshot(): Promise<ActiveWorkoutSnapshot | null> {
  const raw = await getMeta(META_ACTIVE_WORKOUT);
  if (!raw) return null;

  try {
    const snapshot = JSON.parse(raw) as ActiveWorkoutSnapshot;
    if (
      !snapshot ||
      !Number.isFinite(snapshot.sessionId) ||
      snapshot.sessionId <= 0 ||
      !snapshot.plan ||
      !Number.isFinite(snapshot.plan.id) ||
      !snapshot.timer ||
      !["ready", "work", "rest"].includes(snapshot.timer.phase) ||
      !Number.isFinite(snapshot.timer.remainingSeconds) ||
      !Number.isFinite(snapshot.timer.segmentIndex) ||
      !Number.isFinite(snapshot.timer.startedAt)
    ) {
      await clearActiveWorkoutSnapshot();
      return null;
    }

    const session = await runQuery(
      "SELECT endedAt FROM workout_sessions WHERE id = ? LIMIT 1;",
      [snapshot.sessionId]
    );
    if (session.rows.length === 0 || session.rows[0].endedAt != null) {
      await clearActiveWorkoutSnapshot();
      return null;
    }

    return {
      ...snapshot,
      sessionId: Math.floor(snapshot.sessionId),
      timer: {
        ...snapshot.timer,
        segmentIndex: Math.max(0, Math.floor(snapshot.timer.segmentIndex)),
        remainingSeconds: Math.max(0, Math.floor(snapshot.timer.remainingSeconds)),
        isRunning: false,
        summary: {
          completed: false,
          progressPercent: Math.max(0, Math.min(100, Number(snapshot.timer.summary?.progressPercent) || 0)),
          completedSegments: Math.max(0, Math.floor(Number(snapshot.timer.summary?.completedSegments) || 0)),
          totalSegments: Math.max(0, Math.floor(Number(snapshot.timer.summary?.totalSegments) || 0)),
          elapsedSeconds: Math.max(0, Math.floor(Number(snapshot.timer.summary?.elapsedSeconds) || 0))
        }
      }
    };
  } catch {
    await clearActiveWorkoutSnapshot();
    return null;
  }
}

export async function saveActiveWorkoutSnapshot(snapshot: ActiveWorkoutSnapshot): Promise<void> {
  await setMeta(META_ACTIVE_WORKOUT, JSON.stringify(snapshot));
}

export async function clearActiveWorkoutSnapshot(): Promise<void> {
  await runQuery("DELETE FROM meta WHERE key = ?;", [META_ACTIVE_WORKOUT]);
}

export async function getUserSettings(): Promise<UserSettings> {
  const result = await runQuery(
    `
      SELECT
        workoutDays,
        weeklyGoal,
        reminderHour,
        reminderMinute,
        reminderLeadMinutes,
        reminderLeadMinutesCsv,
        notificationsEnabled,
        reminderDelivery,
        timezone
      FROM user_settings
      WHERE id = 1
      LIMIT 1;
    `
  );

  if (result.rows.length === 0) {
    return {
      workoutDays: DEFAULT_WORKOUT_DAYS,
      weeklyGoal: DEFAULT_WEEKLY_GOAL,
      reminderHour: DEFAULT_REMINDER_HOUR,
      reminderMinute: DEFAULT_REMINDER_MINUTE,
      reminderLeadMinutes: [DEFAULT_REMINDER_LEAD_MINUTES],
      notificationsEnabled: false,
      reminderDelivery: "notification",
      timezone: getDeviceTimeZone()
    };
  }

  const row = result.rows[0];
  return {
    workoutDays: parseDays(String(row.workoutDays ?? "")),
    weeklyGoal: Math.max(1, Number(row.weeklyGoal) || DEFAULT_WEEKLY_GOAL),
    reminderHour: Math.min(23, Math.max(0, Number(row.reminderHour) || DEFAULT_REMINDER_HOUR)),
    reminderMinute: Math.min(59, Math.max(0, Number(row.reminderMinute) || DEFAULT_REMINDER_MINUTE)),
    reminderLeadMinutes: parseReminderLeadMinutes(
      String(row.reminderLeadMinutesCsv ?? ""),
      Number(row.reminderLeadMinutes)
    ),
    notificationsEnabled: Number(row.notificationsEnabled) === 1,
    reminderDelivery:
      row.reminderDelivery === "alarm" || row.reminderDelivery === "both"
        ? row.reminderDelivery
        : "notification",
    timezone: String(row.timezone ?? getDeviceTimeZone()) || getDeviceTimeZone()
  };
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const workoutDays = serializeDays(settings.workoutDays);
  const weeklyGoal = Math.max(1, Math.floor(Number(settings.weeklyGoal) || DEFAULT_WEEKLY_GOAL));
  const reminderHour = Math.min(23, Math.max(0, Math.floor(Number(settings.reminderHour) || 0)));
  const reminderMinute = Math.min(59, Math.max(0, Math.floor(Number(settings.reminderMinute) || 0)));
  const reminderLeadMinutes = normalizeReminderLeadMinutes(settings.reminderLeadMinutes);
  const reminderLeadMinutesCsv = serializeReminderLeadMinutes(reminderLeadMinutes);
  const leadMinutesPrimary =
    reminderLeadMinutes.length > 0 ? reminderLeadMinutes[0] : DEFAULT_REMINDER_LEAD_MINUTES;
  const notificationsEnabled = settings.notificationsEnabled ? 1 : 0;
  const reminderDelivery =
    settings.reminderDelivery === "alarm" || settings.reminderDelivery === "both"
      ? settings.reminderDelivery
      : "notification";
  const timezone = String(settings.timezone || getDeviceTimeZone());

  await runQuery(
    `
      INSERT OR REPLACE INTO user_settings (
        id,
        workoutDays,
        weeklyGoal,
        reminderHour,
        reminderMinute,
        reminderLeadMinutes,
        reminderLeadMinutesCsv,
        notificationsEnabled,
        reminderDelivery,
        timezone
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      workoutDays,
      weeklyGoal,
      reminderHour,
      reminderMinute,
      leadMinutesPrimary,
      reminderLeadMinutesCsv,
      notificationsEnabled,
      reminderDelivery,
      timezone
    ]
  );
}

export async function getReminderItems(): Promise<ReminderItem[]> {
  const result = await runQuery(
    `
      SELECT
        id,
        title,
        note,
        mode,
        hour,
        minute,
        dateLabel,
        daysCsv,
        timeSlotsCsv,
        intervalMinutes,
        intervalStartHour,
        intervalStartMinute,
        intervalEndHour,
        intervalEndMinute,
        enabled,
        timezone,
        createdAt,
        updatedAt
      FROM reminders
      ORDER BY enabled DESC, updatedAt DESC;
    `
  );

  return mapRows<{
    id: number;
    title: string;
    note: string | null;
    mode: string;
    hour: number;
    minute: number;
    dateLabel: string | null;
    daysCsv: string | null;
    timeSlotsCsv: string | null;
    intervalMinutes: number | null;
    intervalStartHour: number | null;
    intervalStartMinute: number | null;
    intervalEndHour: number | null;
    intervalEndMinute: number | null;
    enabled: number;
    timezone: string | null;
    createdAt: number;
    updatedAt: number;
  }>(result).map((row) => ({
    id: Number(row.id),
    title: String(row.title ?? ""),
    note: String(row.note ?? ""),
    mode: normalizeReminderMode(row.mode),
    hour: clampHour(row.hour, 9),
    minute: clampMinute(row.minute, 0),
    dateLabel: normalizeReminderDateLabel(row.dateLabel == null ? null : String(row.dateLabel)),
    days: parseDays(String(row.daysCsv ?? "")),
    timeSlots: parseReminderTimeSlots(row.timeSlotsCsv == null ? "" : String(row.timeSlotsCsv)),
    intervalMinutes: normalizeReminderInterval(row.intervalMinutes),
    intervalStartHour: row.intervalStartHour == null ? null : clampHour(row.intervalStartHour, 8),
    intervalStartMinute: row.intervalStartMinute == null ? null : clampMinute(row.intervalStartMinute, 0),
    intervalEndHour: row.intervalEndHour == null ? null : clampHour(row.intervalEndHour, 22),
    intervalEndMinute: row.intervalEndMinute == null ? null : clampMinute(row.intervalEndMinute, 0),
    enabled: Number(row.enabled) === 1,
    timezone: String(row.timezone ?? DEFAULT_REMINDER_BUDDY_TIMEZONE) || DEFAULT_REMINDER_BUDDY_TIMEZONE,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt)
  }));
}

export async function getReminderCompletionEntries(): Promise<ReminderCompletionEntry[]> {
  const result = await runQuery(
    `
      SELECT id, reminderId, occurrenceTs, completedAt
      FROM reminder_completion_logs
      ORDER BY occurrenceTs DESC, completedAt DESC;
    `
  );

  return mapRows<{
    id: number;
    reminderId: number;
    occurrenceTs: number;
    completedAt: number;
  }>(result).map((row) => ({
    id: Number(row.id),
    reminderId: Number(row.reminderId),
    occurrenceTs: Number(row.occurrenceTs),
    completedAt: Number(row.completedAt)
  }));
}

export async function saveReminderItem(input: ReminderInput): Promise<number> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Reminder title is required.");
  }

  const mode = normalizeReminderMode(input.mode);
  let hour = clampHour(input.hour, 9);
  let minute = clampMinute(input.minute, 0);
  let dateLabel = normalizeReminderDateLabel(input.dateLabel);
  const daysCsv = mode === "once" ? "" : serializeDays(input.days);
  const timeSlots = normalizeReminderTimeSlots(input.timeSlots);
  let timeSlotsCsv = mode === "multi" ? serializeReminderTimeSlots(timeSlots) : "";
  const timezone = String(input.timezone || DEFAULT_REMINDER_BUDDY_TIMEZONE);
  const enabled = input.enabled ? 1 : 0;
  const note = input.note.trim().slice(0, 400);
  const now = Date.now();

  let intervalMinutes: number | null = null;
  let intervalStartHour: number | null = null;
  let intervalStartMinute: number | null = null;
  let intervalEndHour: number | null = null;
  let intervalEndMinute: number | null = null;

  if (mode === "once") {
    if (!dateLabel) {
      throw new Error("One-time reminders need a valid date in YYYY-MM-DD format.");
    }
  } else if (mode === "multi") {
    if (timeSlots.length === 0) {
      throw new Error("Add at least one time slot for a multi-time reminder.");
    }
    hour = timeSlots[0].hour;
    minute = timeSlots[0].minute;
    dateLabel = null;
  } else if (mode === "interval") {
    dateLabel = null;
    intervalMinutes = normalizeReminderInterval(input.intervalMinutes);
    if (intervalMinutes == null) {
      throw new Error("Interval reminder must be between 5 and 720 minutes.");
    }
    intervalStartHour = clampHour(input.intervalStartHour, 8);
    intervalStartMinute = clampMinute(input.intervalStartMinute, 0);
    intervalEndHour = clampHour(input.intervalEndHour, 22);
    intervalEndMinute = clampMinute(input.intervalEndMinute, 0);

    const startTotal = intervalStartHour * 60 + intervalStartMinute;
    const endTotal = intervalEndHour * 60 + intervalEndMinute;
    if (endTotal <= startTotal) {
      throw new Error("Interval end time must be later than start time.");
    }
  } else {
    dateLabel = null;
    timeSlotsCsv = "";
  }

  if (input.id) {
    await runQuery(
      `
        UPDATE reminders
        SET
          title = ?,
          note = ?,
          mode = ?,
          hour = ?,
          minute = ?,
          dateLabel = ?,
          daysCsv = ?,
          timeSlotsCsv = ?,
          intervalMinutes = ?,
          intervalStartHour = ?,
          intervalStartMinute = ?,
          intervalEndHour = ?,
          intervalEndMinute = ?,
          enabled = ?,
          timezone = ?,
          updatedAt = ?
        WHERE id = ?;
      `,
      [
        title,
        note,
        mode,
        hour,
        minute,
        dateLabel,
        daysCsv,
        timeSlotsCsv,
        intervalMinutes,
        intervalStartHour,
        intervalStartMinute,
        intervalEndHour,
        intervalEndMinute,
        enabled,
        timezone,
        now,
        input.id
      ]
    );
    return input.id;
  }

  const insertResult = await runQuery(
    `
      INSERT INTO reminders (
        title,
        note,
        mode,
        hour,
        minute,
        dateLabel,
        daysCsv,
        timeSlotsCsv,
        intervalMinutes,
        intervalStartHour,
        intervalStartMinute,
        intervalEndHour,
        intervalEndMinute,
        enabled,
        timezone,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      title,
      note,
      mode,
      hour,
      minute,
      dateLabel,
      daysCsv,
      timeSlotsCsv,
      intervalMinutes,
      intervalStartHour,
      intervalStartMinute,
      intervalEndHour,
      intervalEndMinute,
      enabled,
      timezone,
      now,
      now
    ]
  );

  const reminderId = Number(insertResult.insertId);
  if (!reminderId) {
    throw new Error("Could not save reminder.");
  }
  return reminderId;
}

export async function deleteReminderItem(reminderId: number): Promise<void> {
  await runQuery("DELETE FROM reminder_completion_logs WHERE reminderId = ?;", [reminderId]);
  await runQuery("DELETE FROM reminders WHERE id = ?;", [reminderId]);
}

export async function setReminderItemEnabled(reminderId: number, enabled: boolean): Promise<void> {
  await runQuery("UPDATE reminders SET enabled = ?, updatedAt = ? WHERE id = ?;", [
    enabled ? 1 : 0,
    Date.now(),
    reminderId
  ]);
}

export async function markReminderOccurrenceDone(reminderId: number, occurrenceTs: number): Promise<void> {
  const completedAt = Date.now();
  await runQuery(
    "INSERT OR REPLACE INTO reminder_completion_logs (reminderId, occurrenceTs, completedAt) VALUES (?, ?, ?);",
    [reminderId, occurrenceTs, completedAt]
  );
}

function normalizeAlarmTarget(value: number): number {
  return Math.min(100, Math.max(1, Math.floor(Number(value) || 10)));
}

function toAlarmItem(row: {
  id: number;
  label: string;
  hour: number;
  minute: number;
  daysCsv: string | null;
  pushupTarget: number;
  soundUri: string | null;
  soundName: string | null;
  enabled: number;
  createdAt: number;
  updatedAt: number;
}): AlarmItem {
  return {
    id: Number(row.id),
    label: String(row.label || "Push-up alarm"),
    hour: clampHour(row.hour, 7),
    minute: clampMinute(row.minute, 0),
    days: parseDays(row.daysCsv),
    pushupTarget: normalizeAlarmTarget(row.pushupTarget),
    soundUri: String(row.soundUri ?? ""),
    soundName: String(row.soundName || "System alarm"),
    enabled: Number(row.enabled) === 1,
    timezone: ALARM_TIMEZONE,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt)
  };
}

export async function getAlarmItems(): Promise<AlarmItem[]> {
  const result = await runQuery(
    `SELECT id, label, hour, minute, daysCsv, pushupTarget, soundUri, soundName,
            enabled, createdAt, updatedAt
     FROM alarms
     ORDER BY enabled DESC, hour ASC, minute ASC, updatedAt DESC;`
  );
  return mapRows<Parameters<typeof toAlarmItem>[0]>(result).map(toAlarmItem);
}

export async function saveAlarmItem(input: AlarmInput): Promise<number> {
  const label = input.label.trim().replace(/\s+/g, " ").slice(0, 80) || "Push-up alarm";
  const hour = clampHour(input.hour, 7);
  const minute = clampMinute(input.minute, 0);
  const normalizedDays = normalizeDays(input.days);
  if (normalizedDays.length === 0) {
    throw new Error("Choose at least one repeat day.");
  }
  const daysCsv = serializeDays(normalizedDays);
  const target = normalizeAlarmTarget(input.pushupTarget);
  const soundUri = String(input.soundUri ?? "").slice(0, 2048);
  const soundName = String(input.soundName || "System alarm").trim().slice(0, 120);
  const enabled = input.enabled ? 1 : 0;
  const now = Date.now();

  if (input.id) {
    await runQuery(
      `UPDATE alarms
       SET label = ?, hour = ?, minute = ?, daysCsv = ?, pushupTarget = ?,
           soundUri = ?, soundName = ?, enabled = ?, timezone = ?, updatedAt = ?
       WHERE id = ?;`,
      [label, hour, minute, daysCsv, target, soundUri, soundName, enabled, ALARM_TIMEZONE, now, input.id]
    );
    return input.id;
  }

  const result = await runQuery(
    `INSERT INTO alarms (
       label, hour, minute, daysCsv, pushupTarget, soundUri, soundName,
       enabled, timezone, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [label, hour, minute, daysCsv, target, soundUri, soundName, enabled, ALARM_TIMEZONE, now, now]
  );
  const alarmId = Number(result.insertId);
  if (!alarmId) throw new Error("Could not save alarm.");
  return alarmId;
}

export async function deleteAlarmItem(alarmId: number): Promise<void> {
  await runQuery("DELETE FROM alarms WHERE id = ?;", [alarmId]);
}

export async function setAlarmItemEnabled(alarmId: number, enabled: boolean): Promise<void> {
  await runQuery("UPDATE alarms SET enabled = ?, updatedAt = ? WHERE id = ?;", [
    enabled ? 1 : 0,
    Date.now(),
    alarmId
  ]);
}

export async function saveAlarmCompletionEvents(events: AlarmCompletionEvent[]): Promise<void> {
  for (const event of events) {
    if (!event.eventId || !Number.isFinite(event.completedAt)) continue;
    await runQuery(
      `INSERT OR IGNORE INTO alarm_logs (
         eventId, alarmId, label, firedAt, completedAt, targetReps, completedReps, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        event.eventId,
        event.alarmId,
        event.label.slice(0, 80),
        event.firedAt,
        event.completedAt,
        normalizeAlarmTarget(event.targetReps),
        Math.max(0, Math.floor(Number(event.completedReps) || 0)),
        event.status === "emergency_stopped" ? "emergency_stopped" : "completed"
      ]
    );
  }
}

export async function getAlarmHistory(limit = 50): Promise<AlarmHistoryEntry[]> {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  const result = await runQuery(
    `SELECT id, eventId, alarmId, label, firedAt, completedAt,
            targetReps, completedReps, status
     FROM alarm_logs
     ORDER BY completedAt DESC
     LIMIT ?;`,
    [safeLimit]
  );
  return mapRows<{
    id: number;
    eventId: string;
    alarmId: number | null;
    label: string;
    firedAt: number;
    completedAt: number;
    targetReps: number;
    completedReps: number;
    status: string;
  }>(result).map((row) => ({
    id: Number(row.id),
    eventId: String(row.eventId),
    alarmId: row.alarmId == null ? null : Number(row.alarmId),
    label: String(row.label),
    firedAt: Number(row.firedAt),
    completedAt: Number(row.completedAt),
    targetReps: Number(row.targetReps),
    completedReps: Number(row.completedReps),
    status: row.status === "emergency_stopped" ? "emergency_stopped" : "completed"
  }));
}

async function getVaultSettingsRow(): Promise<{ pinHash: string; biometricsEnabled: boolean }> {
  const result = await runQuery(
    "SELECT pinHash, biometricsEnabled FROM vault_settings WHERE id = 1 LIMIT 1;"
  );
  if (result.rows.length === 0) {
    await runQuery("INSERT OR IGNORE INTO vault_settings (id, pinHash, biometricsEnabled) VALUES (1, '', 0);");
    return { pinHash: "", biometricsEnabled: false };
  }
  const row = result.rows[0];
  return {
    pinHash: String(row.pinHash ?? ""),
    biometricsEnabled: Number(row.biometricsEnabled) === 1
  };
}

export async function getVaultSecuritySettings(): Promise<VaultSecuritySettings> {
  const settings = await getVaultSettingsRow();
  return {
    hasPin: settings.pinHash.trim().length > 0,
    biometricsEnabled: settings.biometricsEnabled
  };
}

export async function verifyVaultPin(pin: string): Promise<boolean> {
  const settings = await getVaultSettingsRow();
  if (!settings.pinHash) return false;
  const normalizedPin = assertValidPin(pin);
  return hashPin(normalizedPin) === settings.pinHash;
}

export async function saveVaultPin(nextPin: string, currentPin?: string): Promise<void> {
  const normalizedNext = assertValidPin(nextPin);
  const nextHash = hashPin(normalizedNext);
  const current = await getVaultSettingsRow();

  if (current.pinHash.length > 0) {
    if (!currentPin) {
      throw new Error("Current PIN is required.");
    }
    const normalizedCurrent = assertValidPin(currentPin);
    if (hashPin(normalizedCurrent) !== current.pinHash) {
      throw new Error("Current PIN is incorrect.");
    }
  }

  await runQuery("UPDATE vault_settings SET pinHash = ? WHERE id = 1;", [nextHash]);
}

export async function setVaultBiometricsEnabled(enabled: boolean): Promise<void> {
  await runQuery("UPDATE vault_settings SET biometricsEnabled = ? WHERE id = 1;", [enabled ? 1 : 0]);
}

export async function getVaultEntries(): Promise<VaultEntry[]> {
  const result = await runQuery(
    `
      SELECT id, appName, accountId, secretCipher, createdAt, updatedAt
      FROM vault_entries
      ORDER BY updatedAt DESC;
    `
  );

  const rows = mapRows<{
    id: number;
    appName: string;
    accountId: string;
    secretCipher: string;
    createdAt: number;
    updatedAt: number;
  }>(result);

  return Promise.all(
    rows.map(async (row) => {
      const id = Number(row.id);
      return {
        id,
        appName: String(row.appName ?? ""),
        accountId: String(row.accountId ?? ""),
        secret: await readVaultSecret(id, String(row.secretCipher ?? "")),
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt)
      };
    })
  );
}

export async function saveVaultEntry(entry: VaultEntryInput): Promise<number> {
  const appName = entry.appName.trim();
  const accountId = entry.accountId.trim();
  const secret = entry.secret;
  if (!appName) {
    throw new Error("App or website name is required.");
  }
  if (!accountId) {
    throw new Error("Login ID is required.");
  }
  if (!secret) {
    throw new Error("Password is required.");
  }

  const now = Date.now();
  const secureStorageAvailable = await canUseSecureVaultStorage();
  if (!secureStorageAvailable) {
    throw new Error("Secure device storage is unavailable. No password was saved.");
  }
  const cipher = VAULT_SECURE_STORE_SENTINEL;
  if (entry.id) {
    await SecureStore.setItemAsync(
      getVaultSecretStorageKey(entry.id),
      secret,
      VAULT_SECURE_STORE_OPTIONS
    );
    await runQuery(
      `
        UPDATE vault_entries
        SET appName = ?, accountId = ?, secretCipher = ?, updatedAt = ?
        WHERE id = ?;
      `,
      [appName, accountId, cipher, now, entry.id]
    );
    return entry.id;
  }

  const insertResult = await runQuery(
    `
      INSERT INTO vault_entries (appName, accountId, secretCipher, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?);
    `,
    [appName, accountId, cipher, now, now]
  );
  const entryId = Number(insertResult.insertId);
  if (!entryId) {
    throw new Error("Could not save vault entry.");
  }
  try {
    await SecureStore.setItemAsync(
      getVaultSecretStorageKey(entryId),
      secret,
      VAULT_SECURE_STORE_OPTIONS
    );
  } catch (error) {
    await runQuery("DELETE FROM vault_entries WHERE id = ?;", [entryId]);
    throw error;
  }
  return entryId;
}

export async function deleteVaultEntry(entryId: number): Promise<void> {
  if (await canUseSecureVaultStorage()) {
    await SecureStore.deleteItemAsync(getVaultSecretStorageKey(entryId)).catch(() => undefined);
  }
  await runQuery("DELETE FROM vault_entries WHERE id = ?;", [entryId]);
}

function normalizeListCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeListItemText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toListBuddyItem(row: {
  id: number;
  categoryId: number;
  text: string;
  completed: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}): ListBuddyItem {
  return {
    id: Number(row.id),
    categoryId: Number(row.categoryId),
    text: String(row.text ?? ""),
    completed: Number(row.completed) === 1,
    sortOrder: Math.max(0, Number(row.sortOrder) || 0),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt)
  };
}

export async function getListCategories(): Promise<ListBuddyCategory[]> {
  const result = await runQuery(
    `
      SELECT id, name, createdAt, updatedAt
      FROM list_categories
      ORDER BY updatedAt DESC, name COLLATE NOCASE ASC;
    `
  );

  const categories = mapRows<{
    id: number;
    name: string;
    createdAt: number;
    updatedAt: number;
  }>(result);

  const hydrated: ListBuddyCategory[] = [];
  for (const category of categories) {
    const totalsResult = await runQuery(
      `
        SELECT
          COUNT(*) AS totalItems,
          COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completedItems
        FROM list_items
        WHERE categoryId = ?;
      `,
      [category.id]
    );
    const totalsRow = totalsResult.rows[0] ?? {};
    const previewResult = await runQuery(
      `
        SELECT id, categoryId, text, completed, sortOrder, createdAt, updatedAt
        FROM list_items
        WHERE categoryId = ?
        ORDER BY completed ASC, sortOrder ASC, updatedAt DESC
        LIMIT 3;
      `,
      [category.id]
    );
    const previewItems = mapRows<{
      id: number;
      categoryId: number;
      text: string;
      completed: number;
      sortOrder: number;
      createdAt: number;
      updatedAt: number;
    }>(previewResult).map(toListBuddyItem);

    hydrated.push({
      id: Number(category.id),
      name: String(category.name ?? ""),
      totalItems: Math.max(0, Number(totalsRow.totalItems) || 0),
      completedItems: Math.max(0, Number(totalsRow.completedItems) || 0),
      previewItems,
      createdAt: Number(category.createdAt),
      updatedAt: Number(category.updatedAt)
    });
  }

  return hydrated;
}

export async function saveListCategory(input: ListBuddyCategoryInput): Promise<number> {
  const name = normalizeListCategoryName(input.name);
  if (!name) {
    throw new Error("Category name is required.");
  }
  if (name.length > MAX_LIST_NAME_LENGTH) {
    throw new Error(`List names can be up to ${MAX_LIST_NAME_LENGTH} characters.`);
  }

  const now = Date.now();
  if (input.id) {
    await runQuery(
      `
        UPDATE list_categories
        SET name = ?, updatedAt = ?
        WHERE id = ?;
      `,
      [name, now, input.id]
    );
    return input.id;
  }

  const insertResult = await runQuery(
    "INSERT INTO list_categories (name, createdAt, updatedAt) VALUES (?, ?, ?);",
    [name, now, now]
  );
  const categoryId = Number(insertResult.insertId);
  if (!categoryId) {
    throw new Error("Could not save category.");
  }
  return categoryId;
}

export async function deleteListCategory(categoryId: number): Promise<void> {
  await runQuery("DELETE FROM list_categories WHERE id = ?;", [categoryId]);
}

export async function getListItems(categoryId: number): Promise<ListBuddyItem[]> {
  const result = await runQuery(
    `
      SELECT id, categoryId, text, completed, sortOrder, createdAt, updatedAt
      FROM list_items
      WHERE categoryId = ?
      ORDER BY completed ASC, sortOrder ASC, updatedAt DESC;
    `,
    [categoryId]
  );

  return mapRows<{
    id: number;
    categoryId: number;
    text: string;
    completed: number;
    sortOrder: number;
    createdAt: number;
    updatedAt: number;
  }>(result).map(toListBuddyItem);
}

export async function saveListItem(input: ListBuddyItemInput): Promise<number> {
  const text = normalizeListItemText(input.text);
  if (!text) {
    throw new Error("List item text is required.");
  }
  if (text.length > MAX_LIST_ITEM_LENGTH) {
    throw new Error(`List items can be up to ${MAX_LIST_ITEM_LENGTH} characters.`);
  }

  const now = Date.now();
  const completed = input.completed ? 1 : 0;

  if (input.id) {
    await runQuery(
      `
        UPDATE list_items
        SET text = ?, completed = ?, updatedAt = ?
        WHERE id = ?;
      `,
      [text, completed, now, input.id]
    );

    await runQuery("UPDATE list_categories SET updatedAt = ? WHERE id = ?;", [now, input.categoryId]);
    return input.id;
  }

  const sortResult = await runQuery(
    "SELECT COALESCE(MAX(sortOrder), -1) + 1 AS nextSortOrder FROM list_items WHERE categoryId = ?;",
    [input.categoryId]
  );
  const nextSortOrder = Math.max(0, Number(sortResult.rows[0]?.nextSortOrder) || 0);

  const insertResult = await runQuery(
    `
      INSERT INTO list_items (categoryId, text, completed, sortOrder, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?);
    `,
    [input.categoryId, text, completed, nextSortOrder, now, now]
  );
  const itemId = Number(insertResult.insertId);
  if (!itemId) {
    throw new Error("Could not save list item.");
  }

  await runQuery("UPDATE list_categories SET updatedAt = ? WHERE id = ?;", [now, input.categoryId]);
  return itemId;
}

export async function setListItemCompleted(itemId: number, completed: boolean): Promise<void> {
  const now = Date.now();
  const categoryResult = await runQuery("SELECT categoryId FROM list_items WHERE id = ? LIMIT 1;", [itemId]);
  const categoryId = Number(categoryResult.rows[0]?.categoryId ?? 0);

  await runQuery(
    "UPDATE list_items SET completed = ?, updatedAt = ? WHERE id = ?;",
    [completed ? 1 : 0, now, itemId]
  );

  if (categoryId > 0) {
    await runQuery("UPDATE list_categories SET updatedAt = ? WHERE id = ?;", [now, categoryId]);
  }
}

export async function deleteListItem(itemId: number): Promise<void> {
  const now = Date.now();
  const categoryResult = await runQuery("SELECT categoryId FROM list_items WHERE id = ? LIMIT 1;", [itemId]);
  const categoryId = Number(categoryResult.rows[0]?.categoryId ?? 0);
  await runQuery("DELETE FROM list_items WHERE id = ?;", [itemId]);
  if (categoryId > 0) {
    await runQuery("UPDATE list_categories SET updatedAt = ? WHERE id = ?;", [now, categoryId]);
  }
}

export async function clearCompletedListItems(categoryId: number): Promise<void> {
  const now = Date.now();
  await runQuery("DELETE FROM list_items WHERE categoryId = ? AND completed = 1;", [categoryId]);
  await runQuery("UPDATE list_categories SET updatedAt = ? WHERE id = ?;", [now, categoryId]);
}

export async function getUserProfile(): Promise<UserProfile> {
  const result = await runQuery(
    "SELECT heightCm, weightKg, goal FROM user_profile WHERE id = 1 LIMIT 1;"
  );
  if (result.rows.length === 0) {
    return {
      heightCm: null,
      weightKg: null,
      goal: ""
    };
  }

  const row = result.rows[0];
  const rawHeight = row.heightCm == null ? null : Number(row.heightCm);
  const rawWeight = row.weightKg == null ? null : Number(row.weightKg);

  return {
    heightCm: rawHeight != null && Number.isFinite(rawHeight) ? rawHeight : null,
    weightKg: rawWeight != null && Number.isFinite(rawWeight) ? rawWeight : null,
    goal: String(row.goal ?? "")
  };
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const heightCm =
    profile.heightCm != null && Number.isFinite(profile.heightCm)
      ? Math.max(0, Number(profile.heightCm))
      : null;
  const weightKg =
    profile.weightKg != null && Number.isFinite(profile.weightKg)
      ? Math.max(0, Number(profile.weightKg))
      : null;
  const goal = profile.goal.trim();

  await runQuery(
    "INSERT OR REPLACE INTO user_profile (id, heightCm, weightKg, goal) VALUES (1, ?, ?, ?);",
    [heightCm, weightKg, goal]
  );
}

export async function getPlanEditorDraft(): Promise<string | null> {
  return getMeta(META_PLAN_DRAFT);
}

export async function savePlanEditorDraft(draftJson: string): Promise<void> {
  await setMeta(META_PLAN_DRAFT, draftJson);
}

export async function clearPlanEditorDraft(): Promise<void> {
  await runQuery("DELETE FROM meta WHERE key = ?;", [META_PLAN_DRAFT]);
}

export async function getHubAppThemeColors(): Promise<string | null> {
  return getMeta(META_HUB_APP_THEME_COLORS);
}

export async function saveHubAppThemeColors(themeJson: string): Promise<void> {
  await setMeta(META_HUB_APP_THEME_COLORS, themeJson);
}

export async function getAppThemeMode(): Promise<"system" | "light" | "dark"> {
  const stored = await getMeta(META_APP_THEME_MODE);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export async function saveAppThemeMode(mode: "system" | "light" | "dark"): Promise<void> {
  await setMeta(META_APP_THEME_MODE, mode);
}

export async function createAnthraBackup(): Promise<AnthraBackup> {
  const tables: AnthraBackup["tables"] = {};
  for (const table of BACKUP_TABLES) {
    const selectedColumns = table.columns.join(", ");
    const result = await runQuery(
      table.name === "meta"
        ? `SELECT ${selectedColumns} FROM meta WHERE key NOT IN (?, ?);`
        : `SELECT ${selectedColumns} FROM ${table.name};`,
      table.name === "meta" ? [META_ACTIVE_WORKOUT, META_PLAN_DRAFT] : []
    );
    tables[table.name] = result.rows.map((row) => {
      const safeRow: Record<string, QueryValue> = {};
      for (const column of table.columns) {
        const value = row[column];
        safeRow[column] = value == null ? null : typeof value === "number" ? value : String(value);
      }
      return safeRow;
    });
  }

  return {
    format: "anthra-backup",
    version: 6,
    createdAt: Date.now(),
    appDataNotice: "Password Buddy credentials are excluded because they are protected by device secure storage.",
    tables
  };
}

function validateBackup(candidate: unknown): AnthraBackup {
  if (!candidate || typeof candidate !== "object") throw new Error("This is not a valid Anthra backup.");
  const source = candidate as Partial<AnthraBackup>;
  if (
    source.format !== "anthra-backup" ||
    !isSupportedAnthraBackupVersion(source.version) ||
    !source.tables ||
    typeof source.tables !== "object"
  ) {
    throw new Error("This backup format is not supported.");
  }

  // Version 1 predates Alarm Buddy. Preserve restore compatibility by treating
  // its two new tables as empty instead of rejecting a previously valid backup.
  const normalizedTables = normalizeLegacyBackupTables(
    source.version,
    source.tables
  ) as AnthraBackup["tables"];
  const normalizedSource = { ...source, tables: normalizedTables };

  let totalRows = 0;
  for (const table of BACKUP_TABLES) {
    const rows = normalizedSource.tables[table.name];
    if (!Array.isArray(rows)) throw new Error(`Backup is missing ${table.name}.`);
    totalRows += rows.length;
    if (totalRows > 100_000) throw new Error("Backup is too large to restore safely.");
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`Invalid row in ${table.name}.`);
      for (const column of table.columns) {
        const value = row[column];
        if (value !== null && typeof value !== "string" && typeof value !== "number") {
          throw new Error(`Invalid ${table.name}.${column} value.`);
        }
      }
    }
  }
  if (normalizedSource.tables.user_settings.length !== 1 || normalizedSource.tables.user_profile.length !== 1) {
    throw new Error("Backup settings are incomplete.");
  }

  return normalizedSource as AnthraBackup;
}

export async function restoreAnthraBackup(candidate: unknown): Promise<void> {
  const backup = validateBackup(candidate);
  const tablesToRestore =
    backup.version >= 6
      ? BACKUP_TABLES
      : BACKUP_TABLES.filter(
          (table) =>
            backup.version >= 5
              ? !(NUTRITION_TABLE_NAMES as readonly string[]).includes(table.name)
              : !(ACTIVITY_TABLE_NAMES as readonly string[]).includes(table.name) &&
                !(NUTRITION_TABLE_NAMES as readonly string[]).includes(table.name)
        );
  const restore = async () => {
    for (const table of [...tablesToRestore].reverse()) {
      await runQuery(`DELETE FROM ${table.name};`);
    }

    for (const table of tablesToRestore) {
      const rows = backup.tables[table.name];
      const placeholders = table.columns.map(() => "?").join(", ");
      const sql = `INSERT INTO ${table.name} (${table.columns.join(", ")}) VALUES (${placeholders});`;
      for (const row of rows) {
        await runQuery(sql, table.columns.map((column) => row[column] ?? null));
      }
    }
    await clearActiveWorkoutSnapshot();
    await clearPlanEditorDraft();
  };

  const transactionDatabase = modernDb as {
    withTransactionAsync?: (task: () => Promise<void>) => Promise<void>;
  } | null;
  if (transactionDatabase?.withTransactionAsync) {
    await transactionDatabase.withTransactionAsync(restore);
  } else {
    await restore();
  }
}

export async function evaluateStreakIfNeeded(weeklyGoal: number): Promise<number> {
  const goal = Math.max(1, Math.floor(Number(weeklyGoal) || DEFAULT_WEEKLY_GOAL));
  const currentWeekStart = startOfWeekMonday(new Date()).getTime();
  const rawMarker = await getMeta(META_MARKER);
  const rawStreak = await getMeta(META_STREAK);

  if (!rawMarker) {
    await setMeta(META_MARKER, String(currentWeekStart));
    await setMeta(META_STREAK, rawStreak ?? "0");
    return Number(rawStreak ?? 0);
  }

  let marker = Number(rawMarker);
  let streak = Number(rawStreak ?? 0);

  if (!Number.isFinite(marker)) {
    marker = currentWeekStart;
  }

  if (!Number.isFinite(streak)) {
    streak = 0;
  }

  if (marker > currentWeekStart) {
    marker = currentWeekStart;
  }

  while (marker < currentWeekStart) {
    const nextMarker = addDays(new Date(marker), 7).getTime();
    const completedDays = await countWorkoutDaysInRange(marker, nextMarker);
    streak = completedDays >= goal ? streak + 1 : 0;
    marker = nextMarker;
  }

  await setMeta(META_MARKER, String(marker));
  await setMeta(META_STREAK, String(streak));
  return streak;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const settings = await getUserSettings();
  const streakWeeks = await evaluateStreakIfNeeded(settings.weeklyGoal);
  const weekStart = startOfWeekMonday(new Date()).getTime();
  const weekEnd = addDays(new Date(weekStart), 7).getTime();
  const weekCompleted = await countWorkoutDaysInRange(weekStart, weekEnd);
  const streakStart = addDays(new Date(weekStart), -7 * Math.max(0, streakWeeks)).getTime();
  const streakDays = await countWorkoutDaysInRange(streakStart, Date.now() + 1);
  const lifetime = await getWorkoutLifetimeSummary(settings.weeklyGoal, weekStart, streakDays);
  const averageResult = await runQuery(
    `
      SELECT AVG(elapsedSeconds) AS averageWorkoutSeconds
      FROM workout_sessions
      WHERE completed = 1 AND elapsedSeconds > 0;
    `
  );
  const averageWorkoutSeconds = Math.max(
    0,
    Math.round(Number(averageResult.rows[0]?.averageWorkoutSeconds) || 0)
  );

  return {
    currentStreak: streakDays,
    bestStreak: lifetime.bestStreak,
    streakWeeks,
    totalWorkouts: lifetime.totalWorkouts,
    averageWorkoutSeconds,
    weekCompleted,
    weekGoal: settings.weeklyGoal
  };
}
