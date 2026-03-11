import * as SQLite from "expo-sqlite";

import type {
  DashboardStats,
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
import { parseDays, serializeDays } from "../constants/schedule";
import { addDays, startOfWeekMonday } from "../utils/date";

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
const DEFAULT_WEEKLY_GOAL = 4;
const DEFAULT_WORKOUT_DAYS = [1, 3, 5];
const DEFAULT_REMINDER_HOUR = 18;
const DEFAULT_REMINDER_MINUTE = 0;
const DEFAULT_REMINDER_LEAD_MINUTES = 60;
const DEFAULT_REMINDER_BUDDY_TIMEZONE = "Asia/Kolkata";
const VAULT_KEY = "anthra-vault-key-v1";
const VAULT_PIN_SALT = "anthra-vault-pin-salt-v1";

type QueryValue = string | number | null;
type QueryResult = {
  rows: Record<string, unknown>[];
  insertId?: number;
};

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

function encodeSecret(secret: string): string {
  const key = VAULT_KEY;
  let encoded = "";
  for (let index = 0; index < secret.length; index += 1) {
    const source = secret.charCodeAt(index);
    const keyCode = key.charCodeAt(index % key.length);
    const cipher = source ^ keyCode;
    encoded += cipher.toString(16).padStart(4, "0");
  }
  return encoded;
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
      notificationsEnabled INTEGER NOT NULL DEFAULT 0
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
        notificationsEnabled
      ) VALUES (1, ?, ?, ?, ?, ?, ?, 0);
    `,
    [
      serializeDays(DEFAULT_WORKOUT_DAYS),
      DEFAULT_WEEKLY_GOAL,
      DEFAULT_REMINDER_HOUR,
      DEFAULT_REMINDER_MINUTE,
      DEFAULT_REMINDER_LEAD_MINUTES,
      String(DEFAULT_REMINDER_LEAD_MINUTES)
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
        notificationsEnabled
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
      notificationsEnabled: false
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
    notificationsEnabled: Number(row.notificationsEnabled) === 1
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
        notificationsEnabled
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      workoutDays,
      weeklyGoal,
      reminderHour,
      reminderMinute,
      leadMinutesPrimary,
      reminderLeadMinutesCsv,
      notificationsEnabled
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
  await runQuery("DELETE FROM reminder_completion_logs WHERE reminderId = ? AND occurrenceTs = ?;", [
    reminderId,
    occurrenceTs
  ]);
  await runQuery(
    "INSERT INTO reminder_completion_logs (reminderId, occurrenceTs, completedAt) VALUES (?, ?, ?);",
    [reminderId, occurrenceTs, completedAt]
  );
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

  return mapRows<{
    id: number;
    appName: string;
    accountId: string;
    secretCipher: string;
    createdAt: number;
    updatedAt: number;
  }>(result).map((row) => ({
    id: Number(row.id),
    appName: String(row.appName ?? ""),
    accountId: String(row.accountId ?? ""),
    secret: decodeSecret(String(row.secretCipher ?? "")),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt)
  }));
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
  const cipher = encodeSecret(secret);
  if (entry.id) {
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
  return entryId;
}

export async function deleteVaultEntry(entryId: number): Promise<void> {
  await runQuery("DELETE FROM vault_entries WHERE id = ?;", [entryId]);
}

function normalizeListCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 60);
}

function normalizeListItemText(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 220);
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

  return {
    currentStreak: streakDays,
    streakWeeks,
    weekCompleted,
    weekGoal: settings.weeklyGoal
  };
}
