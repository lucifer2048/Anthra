import assert from "node:assert/strict";
import test from "node:test";

import trackerStats from "../trackerStats.ts";

const {
  isTaskDueOnDate,
  mondayStart,
  monthBounds,
  shiftTrackerMonth,
  summarizeTrackerPeriod,
  summarizeTrackerTaskPerformance,
  trackerHistoryCutoff
} = trackerStats;

function task(overrides = {}) {
  return {
    id: 1,
    trackerId: 1,
    versionId: 1,
    title: "Read",
    recurrence: "daily",
    days: [0, 1, 2, 3, 4, 5, 6],
    onceDate: null,
    notificationEnabled: false,
    notificationHour: 9,
    notificationMinute: 0,
    timezone: "Asia/Kolkata",
    validFrom: "2026-07-01",
    validTo: null,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

test("Monday-Sunday boundaries do not alter calendar-month boundaries", () => {
  assert.equal(mondayStart("2026-08-02"), "2026-07-27");
  assert.deepEqual(monthBounds("2026-08-02"), { start: "2026-08-01", end: "2026-08-31" });
});

test("daily, selected weekday, and one-time recurrence are evaluated independently", () => {
  assert.equal(isTaskDueOnDate(task(), "2026-08-02"), true);
  assert.equal(isTaskDueOnDate(task({ recurrence: "weekdays", days: [1] }), "2026-08-02"), false);
  assert.equal(isTaskDueOnDate(task({ recurrence: "once", onceDate: "2026-08-02" }), "2026-08-02"), true);
});

test("task versions preserve old schedules while new configuration begins on its valid date", () => {
  const oldVersion = task({ versionId: 1, recurrence: "daily", validTo: "2026-08-01" });
  const newVersion = task({ versionId: 2, recurrence: "weekdays", days: [1], validFrom: "2026-08-02" });
  assert.equal(isTaskDueOnDate(oldVersion, "2026-08-01"), true);
  assert.equal(isTaskDueOnDate(oldVersion, "2026-08-02"), false);
  assert.equal(isTaskDueOnDate(newVersion, "2026-08-02"), false);
  assert.equal(isTaskDueOnDate(newVersion, "2026-08-03"), true);
});

test("period summaries count expected tasks, completions, perfect days, and streaks", () => {
  const tasks = [task()];
  const completions = [
    { taskId: 1, versionId: 1, dateKey: "2026-07-31", completedAt: 1 },
    { taskId: 1, versionId: 1, dateKey: "2026-08-01", completedAt: 2 }
  ];
  const summary = summarizeTrackerPeriod(tasks, completions, "2026-07-31", "2026-08-02", "2026-08-02");
  assert.equal(summary.due, 3);
  assert.equal(summary.done, 2);
  assert.equal(summary.percentage, 67);
  assert.equal(summary.perfectDays, 2);
  assert.equal(summary.streak, 2);
});

test("one-year history cutoff retains today and the preceding 364 days", () => {
  assert.equal(trackerHistoryCutoff("2026-08-02"), "2025-08-03");
  assert.equal(shiftTrackerMonth("2026-01-15", -1), "2025-12-01");
});

test("task performance provides completed and missed counts for each task", () => {
  const tasks = [
    task({ id: 1, title: "Read", sortOrder: 0 }),
    task({ id: 2, versionId: 2, title: "Walk", recurrence: "weekdays", days: [5, 6], sortOrder: 1 })
  ];
  const completions = [
    { taskId: 1, versionId: 1, dateKey: "2026-07-31", completedAt: 1 },
    { taskId: 2, versionId: 2, dateKey: "2026-08-01", completedAt: 2 }
  ];
  const performance = summarizeTrackerTaskPerformance(tasks, completions, "2026-07-31", "2026-08-02");
  assert.deepEqual(
    performance.map(({ days: _days, ...item }) => item),
    [
      { taskId: 1, title: "Read", due: 3, done: 1, missed: 2, pending: 0, percentage: 33 },
      { taskId: 2, title: "Walk", due: 2, done: 1, missed: 1, pending: 0, percentage: 50 }
    ]
  );
  assert.deepEqual(performance[1].days.map((day) => day.status), ["missed", "done", "notScheduled"]);
});

test("current-day incomplete tasks are pending rather than missed", () => {
  const performance = summarizeTrackerTaskPerformance([task()], [], "2026-08-02", "2026-08-02", "2026-08-02");
  assert.deepEqual(
    performance.map(({ days: _days, ...item }) => item),
    [{ taskId: 1, title: "Read", due: 1, done: 0, missed: 0, pending: 1, percentage: 0 }]
  );
  assert.equal(performance[0].days[0].status, "pending");
});
