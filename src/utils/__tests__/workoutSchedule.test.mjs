import assert from "node:assert/strict";
import test from "node:test";

import workoutSchedule from "../workoutSchedule.ts";

const { getPlansForWeekday, getScheduledWorkoutDays } = workoutSchedule;

test("plan days are the canonical workout schedule", () => {
  const plans = [{ workoutDays: [1, 3] }, { workoutDays: [3, 5] }];
  assert.deepEqual(getScheduledWorkoutDays(plans, [2, 4]), [1, 3, 5]);
});

test("legacy settings are used only while no plans exist", () => {
  assert.deepEqual(getScheduledWorkoutDays([], [5, 1, 5]), [1, 5]);
});

test("an any-day plan expands notification scheduling to every day", () => {
  const plans = [{ workoutDays: [1, 3] }, { workoutDays: [] }];
  assert.deepEqual(getScheduledWorkoutDays(plans, [2, 4]), [0, 1, 2, 3, 4, 5, 6]);
});

test("today plans use the same any-day semantics as plan labels", () => {
  const monday = { name: "Monday", workoutDays: [1] };
  const flexible = { name: "Flexible", workoutDays: [] };
  const friday = { name: "Friday", workoutDays: [5] };

  assert.deepEqual(getPlansForWeekday([monday, flexible, friday], 1), [monday, flexible]);
});
