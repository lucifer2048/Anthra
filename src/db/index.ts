import * as SQLite from "expo-sqlite";

import type {
  DashboardStats,
  Exercise,
  UserProfile,
  UserSettings,
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
const DEFAULT_WEEKLY_GOAL = 4;
const DEFAULT_WORKOUT_DAYS = [1, 3, 5];
const DEFAULT_REMINDER_HOUR = 18;
const DEFAULT_REMINDER_MINUTE = 0;
const DEFAULT_REMINDER_LEAD_MINUTES = 60;

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
