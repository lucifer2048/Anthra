import * as SQLite from "expo-sqlite";

import { normalizeDays, parseDays, serializeDays } from "../../constants/schedule";
import { getDeviceTimeZone } from "../../utils/timezone";
import { dateKeyInTimeZone } from "../activity/activityStats";
import { TRACKER_MIGRATIONS } from "./trackerSchema";
import {
  isTaskDueOnDate,
  shiftTrackerDate,
  summarizeTrackerPeriod,
  summarizeTrackerTaskPerformance,
  trackerHistoryCutoff
} from "./trackerStats";
import type {
  Tracker,
  TrackerCompletion,
  TrackerDayTask,
  TrackerPeriodSummary,
  TrackerTask,
  TrackerTaskInput,
  TrackerTaskPerformance
} from "./trackerTypes";
import { validateTrackerName, validateTrackerTask } from "./trackerValidation";

let trackerDb: ReturnType<typeof SQLite.openDatabaseSync> | null = null;
type SqlValue = string | number | null;
type SqlRow = Record<string, unknown>;

function db(): ReturnType<typeof SQLite.openDatabaseSync> {
  if (!trackerDb) trackerDb = SQLite.openDatabaseSync("anthra.db");
  return trackerDb;
}

async function all<T extends SqlRow>(sql: string, values: SqlValue[] = []): Promise<T[]> {
  return db().getAllAsync<T>(sql, ...values);
}

async function run(sql: string, values: SqlValue[] = []) {
  return db().runAsync(sql, ...values);
}

function mapTracker(row: SqlRow): Tracker {
  return {
    id: Number(row.id),
    name: String(row.name),
    createdDate: String(row.createdDate),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt)
  };
}

function mapTask(row: SqlRow): TrackerTask {
  const recurrence = String(row.recurrence);
  return {
    id: Number(row.id),
    trackerId: Number(row.trackerId),
    versionId: Number(row.versionId),
    title: String(row.title),
    recurrence: recurrence === "once" || recurrence === "weekdays" ? recurrence : "daily",
    days: parseDays(String(row.daysCsv ?? "")),
    onceDate: row.onceDate == null ? null : String(row.onceDate),
    notificationEnabled: Number(row.notificationEnabled) === 1,
    notificationHour: Number(row.notificationHour),
    notificationMinute: Number(row.notificationMinute),
    timezone: String(row.timezone),
    validFrom: String(row.validFrom),
    validTo: row.validTo == null ? null : String(row.validTo),
    sortOrder: Number(row.sortOrder),
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt)
  };
}

const TASK_SELECT = `
  SELECT task.id, task.trackerId, version.id AS versionId, version.title,
    version.recurrence, version.daysCsv, version.onceDate,
    version.notificationEnabled, version.notificationHour, version.notificationMinute,
    version.timezone, version.validFrom, version.validTo, version.sortOrder,
    task.createdAt, task.updatedAt
  FROM tracker_buddy_tasks task
  JOIN tracker_buddy_task_versions version ON version.taskId = task.id
`;

export async function initTrackerDatabase(): Promise<void> {
  await db().execAsync("PRAGMA foreign_keys = ON;");
  for (const migration of TRACKER_MIGRATIONS) await db().execAsync(migration);
  await pruneTrackerHistory(trackerTodayKey());
}

export async function pruneTrackerHistory(todayKey = trackerTodayKey()): Promise<void> {
  await run("DELETE FROM tracker_buddy_completions WHERE dateKey < ?;", [trackerHistoryCutoff(todayKey)]);
}

export function trackerTodayKey(timezone = getDeviceTimeZone(), now = Date.now()): string {
  return dateKeyInTimeZone(now, timezone);
}

export async function getTrackers(): Promise<Tracker[]> {
  const rows = await all(`${
    "SELECT id, name, createdDate, createdAt, updatedAt FROM tracker_buddy_trackers"
  } WHERE archivedAt IS NULL ORDER BY updatedAt DESC, id DESC;`);
  return rows.map(mapTracker);
}

export async function saveTracker(nameValue: string, trackerId?: number): Promise<Tracker> {
  const error = validateTrackerName(nameValue);
  if (error) throw new Error(error);
  const name = nameValue.trim();
  const now = Date.now();
  if (trackerId != null) {
    await run(
      "UPDATE tracker_buddy_trackers SET name = ?, updatedAt = ? WHERE id = ? AND archivedAt IS NULL;",
      [name, now, trackerId]
    );
    const rows = await all("SELECT * FROM tracker_buddy_trackers WHERE id = ? LIMIT 1;", [trackerId]);
    if (!rows[0]) throw new Error("Tracker not found.");
    return mapTracker(rows[0]);
  }
  const result = await run(
    "INSERT INTO tracker_buddy_trackers (name, createdDate, archivedAt, createdAt, updatedAt) VALUES (?, ?, NULL, ?, ?);",
    [name, trackerTodayKey(), now, now]
  );
  const id = Number(result.lastInsertRowId);
  const rows = await all("SELECT * FROM tracker_buddy_trackers WHERE id = ? LIMIT 1;", [id]);
  return mapTracker(rows[0]);
}

export async function archiveTracker(trackerId: number, effectiveDate = trackerTodayKey()): Promise<void> {
  const now = Date.now();
  const validTo = shiftTrackerDate(effectiveDate, -1);
  await db().withTransactionAsync(async () => {
    await run("UPDATE tracker_buddy_trackers SET archivedAt = ?, updatedAt = ? WHERE id = ?;", [now, now, trackerId]);
    await run("UPDATE tracker_buddy_tasks SET archivedAt = ?, updatedAt = ? WHERE trackerId = ? AND archivedAt IS NULL;", [now, now, trackerId]);
    await run(
      `UPDATE tracker_buddy_task_versions SET validTo = ?, updatedAt = ?
       WHERE taskId IN (SELECT id FROM tracker_buddy_tasks WHERE trackerId = ?) AND validTo IS NULL;`,
      [validTo, now, trackerId]
    );
  });
}

export async function getCurrentTrackerTasks(trackerId?: number): Promise<TrackerTask[]> {
  const values: SqlValue[] = [];
  const trackerClause = trackerId == null ? "" : " AND task.trackerId = ?";
  if (trackerId != null) values.push(trackerId);
  const rows = await all(
    `${TASK_SELECT} WHERE task.archivedAt IS NULL AND version.validTo IS NULL${trackerClause}
     ORDER BY version.sortOrder, task.id;`,
    values
  );
  return rows.map(mapTask);
}

export async function getTrackerTaskVersions(trackerId: number): Promise<TrackerTask[]> {
  const rows = await all(
    `${TASK_SELECT} WHERE task.trackerId = ? ORDER BY version.validFrom, version.sortOrder, task.id;`,
    [trackerId]
  );
  return rows.map(mapTask);
}

export async function saveTrackerTask(input: TrackerTaskInput, effectiveDate = trackerTodayKey(input.timezone)): Promise<TrackerTask> {
  const validationError = validateTrackerTask(input);
  if (validationError) throw new Error(validationError);
  const now = Date.now();
  const days = input.recurrence === "daily" ? [0, 1, 2, 3, 4, 5, 6] : normalizeDays(input.days);
  let taskId = input.id;

  await db().withTransactionAsync(async () => {
    if (taskId == null) {
      const orderRows = await all<{ nextOrder: number }>(
        "SELECT COALESCE(MAX(v.sortOrder), -1) + 1 AS nextOrder FROM tracker_buddy_tasks t JOIN tracker_buddy_task_versions v ON v.taskId = t.id WHERE t.trackerId = ?;",
        [input.trackerId]
      );
      const inserted = await run(
        "INSERT INTO tracker_buddy_tasks (trackerId, archivedAt, createdAt, updatedAt) VALUES (?, NULL, ?, ?);",
        [input.trackerId, now, now]
      );
      taskId = Number(inserted.lastInsertRowId);
      await insertVersion(taskId, input, days, effectiveDate, Number(orderRows[0]?.nextOrder ?? 0), now);
    } else {
      const currentRows = await all<{ sortOrder: number }>(
        "SELECT sortOrder FROM tracker_buddy_task_versions WHERE taskId = ? AND validTo IS NULL LIMIT 1;",
        [taskId]
      );
      if (!currentRows[0]) throw new Error("Task not found.");
      await run(
        "UPDATE tracker_buddy_task_versions SET validTo = ?, updatedAt = ? WHERE taskId = ? AND validTo IS NULL;",
        [shiftTrackerDate(effectiveDate, -1), now, taskId]
      );
      await insertVersion(taskId, input, days, effectiveDate, Number(currentRows[0].sortOrder), now);
      await run("UPDATE tracker_buddy_tasks SET updatedAt = ? WHERE id = ?;", [now, taskId]);
    }
    await run("UPDATE tracker_buddy_trackers SET updatedAt = ? WHERE id = ?;", [now, input.trackerId]);
  });

  const rows = await all(`${TASK_SELECT} WHERE task.id = ? AND version.validTo IS NULL LIMIT 1;`, [taskId!]);
  return mapTask(rows[0]);
}

async function insertVersion(
  taskId: number,
  input: TrackerTaskInput,
  days: number[],
  effectiveDate: string,
  sortOrder: number,
  now: number
): Promise<void> {
  await run(
    `INSERT INTO tracker_buddy_task_versions (
      taskId, title, recurrence, daysCsv, onceDate, notificationEnabled,
      notificationHour, notificationMinute, timezone, validFrom, validTo,
      sortOrder, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?);`,
    [
      taskId,
      input.title.trim(),
      input.recurrence,
      serializeDays(days),
      input.recurrence === "once" ? input.onceDate : null,
      input.notificationEnabled ? 1 : 0,
      input.notificationHour,
      input.notificationMinute,
      input.timezone,
      effectiveDate,
      sortOrder,
      now,
      now
    ]
  );
}

export async function archiveTrackerTask(taskId: number, effectiveDate = trackerTodayKey()): Promise<void> {
  const now = Date.now();
  await db().withTransactionAsync(async () => {
    await run("UPDATE tracker_buddy_tasks SET archivedAt = ?, updatedAt = ? WHERE id = ?;", [now, now, taskId]);
    await run(
      "UPDATE tracker_buddy_task_versions SET validTo = ?, updatedAt = ? WHERE taskId = ? AND validTo IS NULL;",
      [shiftTrackerDate(effectiveDate, -1), now, taskId]
    );
  });
}

export async function getTrackerDayTasks(trackerId: number, dateKey: string): Promise<TrackerDayTask[]> {
  const versions = await getTrackerTaskVersions(trackerId);
  const due = versions.filter((task) => isTaskDueOnDate(task, dateKey));
  const completions = await all<{ taskId: number; versionId: number; dateKey: string; completedAt: number }>(
    `SELECT taskId, versionId, dateKey, completedAt FROM tracker_buddy_completions
     WHERE dateKey = ? AND taskId IN (SELECT id FROM tracker_buddy_tasks WHERE trackerId = ?);`,
    [dateKey, trackerId]
  );
  const byTask = new Map(completions.map((entry) => [Number(entry.taskId), entry]));
  return due.map((task) => {
    const completion = byTask.get(task.id);
    return {
      ...task,
      dateKey,
      done: Boolean(completion),
      completedAt: completion ? Number(completion.completedAt) : null
    };
  });
}

export async function setTrackerTaskDone(task: TrackerDayTask, done: boolean): Promise<void> {
  if (done) {
    await run(
      `INSERT INTO tracker_buddy_completions (taskId, versionId, dateKey, completedAt)
       VALUES (?, ?, ?, ?) ON CONFLICT(taskId, dateKey) DO UPDATE SET
       versionId = excluded.versionId, completedAt = excluded.completedAt;`,
      [task.id, task.versionId, task.dateKey, Date.now()]
    );
  } else {
    await run("DELETE FROM tracker_buddy_completions WHERE taskId = ? AND dateKey = ?;", [task.id, task.dateKey]);
  }
}

export async function getTrackerPeriodSummary(
  trackerId: number,
  startDate: string,
  endDate: string,
  streakAnchor = endDate
): Promise<TrackerPeriodSummary> {
  const [tasks, completionRows] = await Promise.all([
    getTrackerTaskVersions(trackerId),
    all<{ taskId: number; versionId: number; dateKey: string; completedAt: number }>(
      `SELECT taskId, versionId, dateKey, completedAt FROM tracker_buddy_completions
       WHERE dateKey >= ? AND dateKey <= ? AND taskId IN
       (SELECT id FROM tracker_buddy_tasks WHERE trackerId = ?);`,
      [startDate, endDate, trackerId]
    )
  ]);
  const completions: TrackerCompletion[] = completionRows.map((row) => ({
    taskId: Number(row.taskId),
    versionId: Number(row.versionId),
    dateKey: String(row.dateKey),
    completedAt: Number(row.completedAt)
  }));
  return summarizeTrackerPeriod(tasks, completions, startDate, endDate, streakAnchor);
}

export async function getTrackerTaskPerformance(
  trackerId: number,
  startDate: string,
  endDate: string,
  pendingDate?: string
): Promise<TrackerTaskPerformance[]> {
  const [tasks, completionRows] = await Promise.all([
    getTrackerTaskVersions(trackerId),
    all<{ taskId: number; versionId: number; dateKey: string; completedAt: number }>(
      `SELECT taskId, versionId, dateKey, completedAt FROM tracker_buddy_completions
       WHERE dateKey >= ? AND dateKey <= ? AND taskId IN
       (SELECT id FROM tracker_buddy_tasks WHERE trackerId = ?);`,
      [startDate, endDate, trackerId]
    )
  ]);
  const completions: TrackerCompletion[] = completionRows.map((row) => ({
    taskId: Number(row.taskId),
    versionId: Number(row.versionId),
    dateKey: String(row.dateKey),
    completedAt: Number(row.completedAt)
  }));
  return summarizeTrackerTaskPerformance(tasks, completions, startDate, endDate, pendingDate);
}
