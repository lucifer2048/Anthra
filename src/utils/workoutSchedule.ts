import { matchesDay, normalizeDays } from "../constants/schedule";
import type { WorkoutPlan } from "../types";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Workout plans own the real training schedule. The legacy setting remains a
 * useful default for new plans and a fallback while no plans exist.
 */
export function getScheduledWorkoutDays(
  plans: Pick<WorkoutPlan, "workoutDays">[],
  fallbackDays: number[]
): number[] {
  if (plans.length === 0) {
    return normalizeDays(fallbackDays);
  }

  // An empty plan schedule means "Any day", matching the rest of the app.
  if (plans.some((plan) => normalizeDays(plan.workoutDays).length === 0)) {
    return [...EVERY_DAY];
  }

  return normalizeDays(plans.flatMap((plan) => plan.workoutDays));
}

export function getPlansForWeekday<T extends Pick<WorkoutPlan, "workoutDays">>(
  plans: T[],
  weekday: number
): T[] {
  return plans.filter((plan) => matchesDay(plan.workoutDays, weekday));
}
