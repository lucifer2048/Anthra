import type {
  TrackerCompletion,
  TrackerDayResult,
  TrackerPeriodSummary,
  TrackerTaskPerformance,
  TrackerTask
} from "./trackerTypes";

export const TRACKER_HISTORY_DAYS = 365;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateKey(dateKey: string): Date {
  const match = DATE_KEY.exec(dateKey);
  if (!match) throw new Error(`Invalid date: ${dateKey}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== dateKey) throw new Error(`Invalid date: ${dateKey}`);
  return date;
}

export function shiftTrackerDate(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function trackerDateRange(startDate: string, endDate: string): string[] {
  if (startDate > endDate) return [];
  const result: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = shiftTrackerDate(cursor, 1)) {
    result.push(cursor);
  }
  return result;
}

export function weekdayForDateKey(dateKey: string): number {
  return parseDateKey(dateKey).getUTCDay();
}

export function isTaskDueOnDate(task: TrackerTask, dateKey: string): boolean {
  if (dateKey < task.validFrom || (task.validTo != null && dateKey > task.validTo)) return false;
  if (task.recurrence === "once") return task.onceDate === dateKey;
  if (task.recurrence === "daily") return true;
  return task.days.includes(weekdayForDateKey(dateKey));
}

export function mondayStart(dateKey: string): string {
  const day = weekdayForDateKey(dateKey);
  return shiftTrackerDate(dateKey, day === 0 ? -6 : 1 - day);
}

export function sundayEnd(dateKey: string): string {
  return shiftTrackerDate(mondayStart(dateKey), 6);
}

export function monthBounds(dateKey: string): { start: string; end: string } {
  const date = parseDateKey(dateKey);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    start: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    end: end.toISOString().slice(0, 10)
  };
}

export function trackerHistoryCutoff(todayKey: string, retentionDays = TRACKER_HISTORY_DAYS): string {
  return shiftTrackerDate(todayKey, -(Math.max(1, Math.floor(retentionDays)) - 1));
}

export function shiftTrackerMonth(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1)).toISOString().slice(0, 10);
}

export function summarizeTrackerTaskPerformance(
  tasks: TrackerTask[],
  completions: TrackerCompletion[],
  startDate: string,
  endDate: string,
  pendingDate?: string
): TrackerTaskPerformance[] {
  const dates = trackerDateRange(startDate, endDate);
  const completionKeys = new Set(completions.map((entry) => `${entry.taskId}:${entry.dateKey}`));
  const byTask = new Map<number, TrackerTaskPerformance & { latestValidFrom: string; sortOrder: number }>();

  for (const dateKey of dates) {
    const dueByTask = new Map<number, TrackerTask>();
    for (const task of tasks) {
      if (!isTaskDueOnDate(task, dateKey)) continue;
      const existing = dueByTask.get(task.id);
      if (!existing || task.validFrom > existing.validFrom) dueByTask.set(task.id, task);
    }
    for (const task of dueByTask.values()) {
      const existing = byTask.get(task.id);
      const done = completionKeys.has(`${task.id}:${dateKey}`) ? 1 : 0;
      const pending = !done && dateKey === pendingDate ? 1 : 0;
      if (!existing) {
        byTask.set(task.id, {
          taskId: task.id,
          title: task.title,
          due: 1,
          done,
          missed: 1 - done - pending,
          pending,
          percentage: done * 100,
          days: [{ dateKey, status: done ? "done" : pending ? "pending" : "missed" }],
          latestValidFrom: task.validFrom,
          sortOrder: task.sortOrder
        });
        continue;
      }
      existing.due += 1;
      existing.done += done;
      existing.missed += 1 - done - pending;
      existing.pending += pending;
      existing.days.push({ dateKey, status: done ? "done" : pending ? "pending" : "missed" });
      if (task.validFrom >= existing.latestValidFrom) {
        existing.title = task.title;
        existing.latestValidFrom = task.validFrom;
        existing.sortOrder = task.sortOrder;
      }
      existing.percentage = Math.round((existing.done / existing.due) * 100);
    }
  }

  return Array.from(byTask.values())
    .sort((a, b) => a.sortOrder - b.sortOrder || a.taskId - b.taskId)
    .map(({ latestValidFrom: _latestValidFrom, sortOrder: _sortOrder, ...performance }) => {
      const scheduledDays = new Map(performance.days.map((day) => [day.dateKey, day.status]));
      return {
        ...performance,
        days: dates.map((dateKey) => ({ dateKey, status: scheduledDays.get(dateKey) ?? "notScheduled" }))
      };
    });
}

export function summarizeTrackerPeriod(
  tasks: TrackerTask[],
  completions: TrackerCompletion[],
  startDate: string,
  endDate: string,
  streakAnchor = endDate
): TrackerPeriodSummary {
  const completionKeys = new Set(completions.map((entry) => `${entry.taskId}:${entry.dateKey}`));
  const days: TrackerDayResult[] = trackerDateRange(startDate, endDate).map((dateKey) => {
    const dueTasks = tasks.filter((task) => isTaskDueOnDate(task, dateKey));
    const done = dueTasks.filter((task) => completionKeys.has(`${task.id}:${dateKey}`)).length;
    return {
      dateKey,
      due: dueTasks.length,
      done,
      percentage: dueTasks.length > 0 ? Math.round((done / dueTasks.length) * 100) : null
    };
  });
  const due = days.reduce((sum, day) => sum + day.due, 0);
  const done = days.reduce((sum, day) => sum + day.done, 0);
  const activeDays = days.filter((day) => day.due > 0).length;
  const perfectDays = days.filter((day) => day.due > 0 && day.done === day.due).length;

  let streak = 0;
  let cursor = Math.min(days.length - 1, days.findIndex((day) => day.dateKey === streakAnchor));
  if (cursor < 0) cursor = days.length - 1;
  // An unfinished current day should not erase momentum earned through
  // yesterday; it only joins the streak once all of its due tasks are done.
  if (cursor >= 0 && days[cursor].due > 0 && days[cursor].done !== days[cursor].due) cursor -= 1;
  while (cursor >= 0) {
    const day = days[cursor];
    if (day.due === 0) {
      cursor -= 1;
      continue;
    }
    if (day.done !== day.due) break;
    streak += 1;
    cursor -= 1;
  }

  return {
    startDate,
    endDate,
    due,
    done,
    percentage: due > 0 ? Math.round((done / due) * 100) : 0,
    perfectDays,
    activeDays,
    streak,
    days
  };
}
