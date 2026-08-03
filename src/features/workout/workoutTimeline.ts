export type WorkoutTimelineExercise = {
  name: string;
  workSeconds: number;
  restSeconds: number;
};

export type WorkoutTimelineSection = {
  name: string;
  loops: number;
  restSeconds: number;
  exercises: readonly WorkoutTimelineExercise[];
};

export type WorkoutTimelinePlan = {
  loops: number;
  exercises: readonly WorkoutTimelineExercise[];
  sections: readonly WorkoutTimelineSection[];
};

export type WorkoutTimelineSegment = {
  kind: "work" | "rest";
  seconds: number;
  exerciseName: string;
  setName: string;
  setIndex: number;
  setCount: number;
  loopIndex: number;
  loopCount: number;
};

export type WorkoutTimeline = {
  segments: readonly WorkoutTimelineSegment[];
  totalDurationSeconds: number;
  workSegmentCount: number;
  segmentStartSeconds: readonly number[];
};

export type WorkoutTimelinePhase = "ready" | "work" | "rest" | "complete";

export type WorkoutTimelineProgress = {
  progressPercent: number;
  completedDurationSeconds: number;
  totalDurationSeconds: number;
  completedSegments: number;
  totalSegments: number;
};

function positiveWholeNumber(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function nonNegativeWholeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizedSections(plan: WorkoutTimelinePlan): readonly WorkoutTimelineSection[] {
  if (plan.sections.length > 0) {
    return plan.sections.filter((section) => section.exercises.length > 0);
  }

  if (plan.exercises.length === 0) return [];

  return [
    {
      name: "Main",
      loops: positiveWholeNumber(plan.loops, 1),
      restSeconds: 0,
      exercises: plan.exercises
    }
  ];
}

/**
 * Builds the exact sequence the workout timer runs.
 *
 * Exercise rest belongs between exercises. Set rest belongs between loops and
 * sets. The final work interval is never followed by a rest interval.
 */
export function buildWorkoutTimeline(plan: WorkoutTimelinePlan): WorkoutTimeline {
  const sections = normalizedSections(plan);
  const segments: WorkoutTimelineSegment[] = [];

  sections.forEach((section, sectionIndex) => {
    const loopCount = positiveWholeNumber(section.loops, 1);
    const lastExerciseIndex = section.exercises.length - 1;

    for (let loopIndex = 0; loopIndex < loopCount; loopIndex += 1) {
      section.exercises.forEach((exercise, exerciseIndex) => {
        segments.push({
          kind: "work",
          seconds: positiveWholeNumber(exercise.workSeconds, 1),
          exerciseName: exercise.name,
          setName: section.name,
          setIndex: sectionIndex,
          setCount: sections.length,
          loopIndex,
          loopCount
        });

        const isLastExerciseInLoop = exerciseIndex === lastExerciseIndex;
        const exerciseRestSeconds = nonNegativeWholeNumber(exercise.restSeconds);
        if (!isLastExerciseInLoop && exerciseRestSeconds > 0) {
          segments.push({
            kind: "rest",
            seconds: exerciseRestSeconds,
            exerciseName: exercise.name,
            setName: section.name,
            setIndex: sectionIndex,
            setCount: sections.length,
            loopIndex,
            loopCount
          });
        }

        const isLastLoopInSet = loopIndex === loopCount - 1;
        const isLastSet = sectionIndex === sections.length - 1;
        const setRestSeconds = nonNegativeWholeNumber(section.restSeconds);
        if (
          isLastExerciseInLoop &&
          setRestSeconds > 0 &&
          !(isLastLoopInSet && isLastSet)
        ) {
          segments.push({
            kind: "rest",
            seconds: setRestSeconds,
            exerciseName: `${section.name} reset`,
            setName: section.name,
            setIndex: sectionIndex,
            setCount: sections.length,
            loopIndex,
            loopCount
          });
        }
      });
    }
  });

  const segmentStartSeconds: number[] = [];
  let totalDurationSeconds = 0;
  let workSegmentCount = 0;

  for (const segment of segments) {
    segmentStartSeconds.push(totalDurationSeconds);
    totalDurationSeconds += segment.seconds;
    if (segment.kind === "work") workSegmentCount += 1;
  }

  return {
    segments,
    totalDurationSeconds,
    workSegmentCount,
    segmentStartSeconds
  };
}

export function estimateWorkoutDurationSeconds(plan: WorkoutTimelinePlan): number {
  return buildWorkoutTimeline(plan).totalDurationSeconds;
}

export function getWorkoutTimelineProgress(
  timeline: WorkoutTimeline,
  state: {
    phase: WorkoutTimelinePhase;
    segmentIndex: number;
    remainingSeconds: number;
  }
): WorkoutTimelineProgress {
  const totalSegments = timeline.segments.length;
  const totalDurationSeconds = timeline.totalDurationSeconds;

  if (state.phase === "complete") {
    return {
      progressPercent: 100,
      completedDurationSeconds: totalDurationSeconds,
      totalDurationSeconds,
      completedSegments: totalSegments,
      totalSegments
    };
  }

  if (state.phase === "ready" || totalSegments === 0 || totalDurationSeconds <= 0) {
    return {
      progressPercent: 0,
      completedDurationSeconds: 0,
      totalDurationSeconds,
      completedSegments: 0,
      totalSegments
    };
  }

  const requestedSegmentIndex = Number.isFinite(state.segmentIndex)
    ? Math.floor(state.segmentIndex)
    : 0;
  const segmentIndex = Math.max(0, Math.min(totalSegments, requestedSegmentIndex));
  const activeSegment = timeline.segments[segmentIndex];
  const completedBeforeSegment =
    segmentIndex >= totalSegments
      ? totalDurationSeconds
      : timeline.segmentStartSeconds[segmentIndex] ?? 0;
  const requestedRemainingSeconds = Number.isFinite(state.remainingSeconds)
    ? state.remainingSeconds
    : activeSegment?.seconds ?? 0;
  const remainingSeconds = activeSegment
    ? Math.max(0, Math.min(activeSegment.seconds, requestedRemainingSeconds))
    : 0;
  const consumedActiveSeconds = activeSegment
    ? activeSegment.seconds - remainingSeconds
    : 0;
  const completedDurationSeconds = Math.max(
    0,
    Math.min(totalDurationSeconds, completedBeforeSegment + consumedActiveSeconds)
  );

  return {
    progressPercent: Math.max(
      0,
      Math.min(100, (completedDurationSeconds / totalDurationSeconds) * 100)
    ),
    completedDurationSeconds,
    totalDurationSeconds,
    completedSegments: segmentIndex,
    totalSegments
  };
}

export function formatWorkoutDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
