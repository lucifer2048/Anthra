import type { LeaderboardEntry, LeaderboardMetric } from "./socialTypes";

export type HomeLeaderboardPosition = {
  metric: LeaderboardMetric;
  value: number | null;
  rank: number | null;
  participantCount: number;
};

const METRICS: LeaderboardMetric[] = ["steps", "workouts", "streak"];

function valueFor(entry: LeaderboardEntry, metric: LeaderboardMetric): number | null {
  if (metric === "steps") return entry.steps;
  if (metric === "workouts") return entry.workoutCount;
  return entry.workoutStreak;
}

export function getHomeLeaderboardPositions(
  entries: LeaderboardEntry[]
): HomeLeaderboardPosition[] {
  return METRICS.map((metric) => {
    const participants = entries.filter((entry) => valueFor(entry, metric) != null);
    const current = participants.find((entry) => entry.isCurrentUser);
    const currentValue = current ? valueFor(current, metric) : null;

    return {
      metric,
      value: currentValue,
      rank: currentValue == null
        ? null
        : 1 + participants.filter((entry) => Number(valueFor(entry, metric)) > currentValue).length,
      participantCount: participants.length
    };
  });
}
