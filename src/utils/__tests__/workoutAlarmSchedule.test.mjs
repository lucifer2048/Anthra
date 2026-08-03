import assert from "node:assert/strict";
import test from "node:test";

import workoutAlarmSchedule from "../workoutAlarmSchedule.ts";

const { buildWorkoutAlarmSlots } = workoutAlarmSchedule;

test("workout alarms use each configured lead time", () => {
  assert.deepEqual(buildWorkoutAlarmSlots(18, 0, [60, 15], [1, 3, 5]), [
    { leadMinutes: 60, hour: 17, minute: 0, days: [1, 3, 5] },
    { leadMinutes: 15, hour: 17, minute: 45, days: [1, 3, 5] }
  ]);
});

test("a lead time crossing midnight moves the alarm to the previous day", () => {
  assert.deepEqual(buildWorkoutAlarmSlots(0, 30, [60], [1]), [
    { leadMinutes: 60, hour: 23, minute: 30, days: [0] }
  ]);
});

test("Sunday reminders wrap to Saturday", () => {
  assert.deepEqual(buildWorkoutAlarmSlots(0, 0, [120], [0]), [
    { leadMinutes: 120, hour: 22, minute: 0, days: [6] }
  ]);
});
