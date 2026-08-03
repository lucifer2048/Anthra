import assert from "node:assert/strict";
import test from "node:test";

import workoutTimeline from "../workoutTimeline.ts";

const {
  buildWorkoutTimeline,
  estimateWorkoutDurationSeconds,
  formatWorkoutDuration,
  getWorkoutTimelineProgress
} = workoutTimeline;

function plan(overrides = {}) {
  return {
    loops: 1,
    exercises: [],
    sections: [],
    ...overrides
  };
}

test("builds exercise rests and set rests using the timer's canonical rules", () => {
  const input = plan({
    sections: [
      {
        name: "Strength",
        loops: 2,
        restSeconds: 30,
        exercises: [
          { name: "Push-ups", workSeconds: 40, restSeconds: 10 },
          { name: "Squats", workSeconds: 50, restSeconds: 99 }
        ]
      },
      {
        name: "Finisher",
        loops: 1,
        restSeconds: 60,
        exercises: [
          { name: "Plank", workSeconds: 20, restSeconds: 5 },
          { name: "High knees", workSeconds: 25, restSeconds: 7 }
        ]
      }
    ]
  });

  const timeline = buildWorkoutTimeline(input);

  assert.deepEqual(
    timeline.segments.map((segment) => [segment.kind, segment.seconds, segment.exerciseName]),
    [
      ["work", 40, "Push-ups"],
      ["rest", 10, "Push-ups"],
      ["work", 50, "Squats"],
      ["rest", 30, "Strength reset"],
      ["work", 40, "Push-ups"],
      ["rest", 10, "Push-ups"],
      ["work", 50, "Squats"],
      ["rest", 30, "Strength reset"],
      ["work", 20, "Plank"],
      ["rest", 5, "Plank"],
      ["work", 25, "High knees"]
    ]
  );
  assert.equal(timeline.totalDurationSeconds, 310);
  assert.equal(timeline.workSegmentCount, 6);
  assert.equal(estimateWorkoutDurationSeconds(input), 310);
});

test("does not add an exercise or set rest after the final work interval", () => {
  const timeline = buildWorkoutTimeline(
    plan({
      sections: [
        {
          name: "Main",
          loops: 2,
          restSeconds: 30,
          exercises: [{ name: "Plank", workSeconds: 40, restSeconds: 20 }]
        }
      ]
    })
  );

  assert.deepEqual(
    timeline.segments.map(({ kind, seconds }) => ({ kind, seconds })),
    [
      { kind: "work", seconds: 40 },
      { kind: "rest", seconds: 30 },
      { kind: "work", seconds: 40 }
    ]
  );
  assert.equal(timeline.totalDurationSeconds, 110);
});

test("supports legacy plans without sections", () => {
  const timeline = buildWorkoutTimeline(
    plan({
      loops: 2,
      exercises: [
        { name: "A", workSeconds: 10, restSeconds: 5 },
        { name: "B", workSeconds: 20, restSeconds: 60 }
      ]
    })
  );

  assert.deepEqual(
    timeline.segments.map(({ kind, seconds }) => ({ kind, seconds })),
    [
      { kind: "work", seconds: 10 },
      { kind: "rest", seconds: 5 },
      { kind: "work", seconds: 20 },
      { kind: "work", seconds: 10 },
      { kind: "rest", seconds: 5 },
      { kind: "work", seconds: 20 }
    ]
  );
  assert.equal(timeline.totalDurationSeconds, 70);
});

test("progress is weighted by interval duration", () => {
  const timeline = buildWorkoutTimeline(
    plan({
      sections: [
        {
          name: "Main",
          loops: 1,
          restSeconds: 0,
          exercises: [
            { name: "Warm-up", workSeconds: 10, restSeconds: 90 },
            { name: "Work", workSeconds: 100, restSeconds: 0 }
          ]
        }
      ]
    })
  );

  const progress = getWorkoutTimelineProgress(timeline, {
    phase: "rest",
    segmentIndex: 1,
    remainingSeconds: 45
  });

  assert.equal(progress.completedDurationSeconds, 55);
  assert.equal(progress.totalDurationSeconds, 200);
  assert.ok(Math.abs(progress.progressPercent - 27.5) < Number.EPSILON * 100);
  assert.equal(progress.completedSegments, 1);
  assert.equal(progress.totalSegments, 3);
});

test("ready and complete progress have stable boundary values", () => {
  const timeline = buildWorkoutTimeline(
    plan({
      sections: [
        {
          name: "Main",
          loops: 1,
          restSeconds: 0,
          exercises: [{ name: "Work", workSeconds: 30, restSeconds: 0 }]
        }
      ]
    })
  );

  assert.equal(
    getWorkoutTimelineProgress(timeline, {
      phase: "ready",
      segmentIndex: 0,
      remainingSeconds: 5
    }).progressPercent,
    0
  );
  assert.deepEqual(
    getWorkoutTimelineProgress(timeline, {
      phase: "complete",
      segmentIndex: 0,
      remainingSeconds: 30
    }),
    {
      progressPercent: 100,
      completedDurationSeconds: 30,
      totalDurationSeconds: 30,
      completedSegments: 1,
      totalSegments: 1
    }
  );
});

test("formats durations consistently and safely", () => {
  assert.equal(formatWorkoutDuration(0), "0:00");
  assert.equal(formatWorkoutDuration(65.9), "1:05");
  assert.equal(formatWorkoutDuration(7_205), "120:05");
  assert.equal(formatWorkoutDuration(-1), "0:00");
  assert.equal(formatWorkoutDuration(Number.NaN), "0:00");
});
