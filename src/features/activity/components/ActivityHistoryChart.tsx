import { Text, View } from "react-native";

import { useAnthraTheme } from "../../../design-system";
import { recentDateKeys } from "../activityStats";
import type { ActivityDailySummary } from "../activityTypes";

type ActivityHistoryChartProps = {
  todayKey: string;
  summaries: ActivityDailySummary[];
  dailyGoal: number;
};

function compactValue(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function ActivityHistoryChart({
  todayKey,
  summaries,
  dailyGoal
}: ActivityHistoryChartProps) {
  const theme = useAnthraTheme();
  const byDate = new Map(summaries.map((summary) => [summary.dateKey, summary]));
  const days = recentDateKeys(todayKey, 7);
  const maxValue = Math.max(
    dailyGoal,
    ...days.map((dateKey) => byDate.get(dateKey)?.authoritativeSteps ?? 0)
  );

  return (
    <View
      className="flex-row items-end justify-between"
      style={{ height: 156, gap: theme.spacing.xs }}
    >
      {days.map((dateKey) => {
        const steps = byDate.get(dateKey)?.authoritativeSteps ?? 0;
        const height = steps > 0
          ? Math.max(4, Math.round((steps / Math.max(1, maxValue)) * 88))
          : 0;
        const date = new Date(`${dateKey}T12:00:00Z`);
        const shortLabel = new Intl.DateTimeFormat(undefined, {
          weekday: "narrow",
          timeZone: "UTC"
        }).format(date);
        const fullLabel = new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
          timeZone: "UTC"
        }).format(date);
        const goalPercent = Math.round((steps / Math.max(1, dailyGoal)) * 100);

        return (
          <View
            key={dateKey}
            accessible
            accessibilityLabel={`${fullLabel}${dateKey === todayKey ? ", today" : ""}: ${steps.toLocaleString()} steps, ${goalPercent} percent of goal`}
            className="min-w-0 flex-1 items-center"
          >
            <Text
              accessible={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[theme.typography.caption, { color: theme.colors.textSecondary }]}
            >
              {steps > 0 ? compactValue(steps) : "—"}
            </Text>
            <View
              accessible={false}
              className="mt-2 w-full justify-end overflow-hidden"
              style={{
                maxWidth: 28,
                height: 92,
                borderRadius: theme.radii.full,
                backgroundColor: theme.colors.progressTrack
              }}
            >
              {height > 0 ? (
                <View
                  accessible={false}
                  className="w-full"
                  style={{
                    height,
                    borderRadius: theme.radii.full,
                    backgroundColor: theme.colors.brand,
                    opacity: steps >= dailyGoal ? 1 : 0.68
                  }}
                />
              ) : null}
            </View>
            <Text
              accessible={false}
              style={[
                theme.typography.caption,
                {
                  color: dateKey === todayKey
                    ? theme.colors.brand
                    : theme.colors.textSecondary,
                  fontWeight: dateKey === todayKey ? "700" : "500",
                  marginTop: theme.spacing.sm
                }
              ]}
            >
              {shortLabel}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
