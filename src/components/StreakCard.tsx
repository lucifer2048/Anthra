import { StyleSheet, Text, View } from "react-native";
import { useAnthraTheme, type SemanticColors } from "../design-system";

type StreakCardProps = {
  streakDays: number;
  bestStreak: number;
  totalWorkouts: number;
  averageWorkoutSeconds: number;
  weekCompleted: number;
  weekGoal: number;
  accentColor?: string;
};

type MetricProps = {
  label: string;
  value: number | string;
  accent?: boolean;
  accentColor: string;
  colors: SemanticColors;
};

const WEEK_PROGRESS_WIDTH = 800;
export const STREAK_CARD_WIDTH = 1080;
export const STREAK_CARD_HEIGHT = 2160;

function getStreakFontSize(value: number): number {
  const digits = String(Math.max(0, Math.floor(value))).length;
  if (digits === 1) return 520;
  if (digits === 2) return 440;
  if (digits === 3) return 330;
  if (digits === 4) return 245;
  return 190;
}

function getMetricFontSize(value: number | string): number {
  const characters = String(value).length;
  if (characters <= 2) return 110;
  if (characters === 3) return 96;
  if (characters <= 5) return 78;
  if (characters <= 7) return 66;
  return 56;
}

function Background({ accentColor }: { accentColor: string }) {
  return (
    <>
      <View style={[styles.topAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.heroWash, { backgroundColor: accentColor }]} />
      <View style={[styles.bottomAccent, { backgroundColor: accentColor }]} />
    </>
  );
}

function Header({ accentColor, colors }: { accentColor: string; colors: SemanticColors }) {
  return (
    <View style={styles.header}>
      <Text allowFontScaling={false} style={[styles.brand, { color: colors.textPrimary }]}>ANTHRA</Text>
      <View style={[styles.headerMark, { backgroundColor: accentColor }]} />
    </View>
  );
}

function Hero({
  streakDays,
  bestStreak,
  accentColor,
  colors
}: {
  streakDays: number;
  bestStreak: number;
  accentColor: string;
  colors: SemanticColors;
}) {
  const safeStreak = Math.max(0, Math.floor(streakDays));
  const fontSize = getStreakFontSize(safeStreak);
  const isPersonalBest = safeStreak > 0 && safeStreak >= bestStreak;

  return (
    <View style={styles.hero}>
      <Text allowFontScaling={false} style={[styles.heroLabel, { color: colors.textSecondary }]}>CURRENT STREAK</Text>
      <View style={styles.heroNumberArea}>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.heroNumber,
            {
              color: accentColor,
              fontSize,
              lineHeight: fontSize + 18
            }
          ]}
        >
          {safeStreak}
        </Text>
      </View>
      <Text allowFontScaling={false} style={[styles.heroUnit, { color: colors.textPrimary }]}>ACTIVE DAYS</Text>
      <View style={[styles.heroUnderline, { backgroundColor: accentColor }]} />
      <Text allowFontScaling={false} style={[styles.heroMotivation, { color: accentColor }]}>
        {isPersonalBest ? "PERSONAL BEST IN MOTION" : "KEEP BUILDING THE RUN"}
      </Text>
    </View>
  );
}

function WeeklyProgress({
  weekCompleted,
  weekGoal,
  accentColor,
  colors
}: {
  weekCompleted: number;
  weekGoal: number;
  accentColor: string;
  colors: SemanticColors;
}) {
  const goal = Math.max(1, Math.floor(weekGoal));
  const completed = Math.max(0, Math.floor(weekCompleted));
  const progressRatio = Math.min(1, completed / goal);

  return (
    <View
      style={[
        styles.weekPanel,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border }
      ]}
    >
      <View style={styles.weekRow}>
        <Text allowFontScaling={false} style={[styles.sectionLabel, { color: colors.textSecondary }]}>WEEKLY GOAL</Text>
        <View style={styles.weekNumbers}>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.weekCount, { color: colors.textPrimary }]}>{completed}</Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.weekDivider, { color: colors.textTertiary }]}>/</Text>
          <Text allowFontScaling={false} numberOfLines={1} style={[styles.weekGoal, { color: colors.textTertiary }]}>{goal}</Text>
        </View>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.progressTrack }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: accentColor, width: WEEK_PROGRESS_WIDTH * progressRatio }
          ]}
        />
      </View>
    </View>
  );
}

function Metric({ label, value, accent, accentColor, colors }: MetricProps) {
  const safeValue = typeof value === "number" ? Math.max(0, Math.floor(value)) : value;

  return (
    <View style={styles.metric}>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={[
          styles.metricValue,
          { fontSize: getMetricFontSize(safeValue) },
          { color: accent ? accentColor : colors.textPrimary }
        ]}
      >
        {safeValue}
      </Text>
      <Text allowFontScaling={false} style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function LifetimeStats({
  totalWorkouts,
  bestStreak,
  averageWorkoutSeconds,
  accentColor,
  colors
}: {
  totalWorkouts: number;
  bestStreak: number;
  averageWorkoutSeconds: number;
  accentColor: string;
  colors: SemanticColors;
}) {
  return (
    <View style={[styles.lifetimePanel, { borderTopColor: colors.divider }]}>
      <Text allowFontScaling={false} style={[styles.sectionLabel, { color: colors.textSecondary }]}>LIFETIME</Text>
      <View style={styles.metricRow}>
        <Metric label="TOTAL WORKOUTS" value={totalWorkouts} accent accentColor={accentColor} colors={colors} />
        <View style={[styles.metricDivider, { backgroundColor: colors.divider }]} />
        <Metric label="BEST STREAK · DAYS" value={bestStreak} accentColor={accentColor} colors={colors} />
        <View style={[styles.metricDivider, { backgroundColor: colors.divider }]} />
        <Metric
          label="AVG WORKOUT"
          value={formatAverageWorkoutTime(averageWorkoutSeconds)}
          accentColor={accentColor}
          colors={colors}
        />
      </View>
    </View>
  );
}

export function StreakCard({
  streakDays,
  bestStreak,
  totalWorkouts,
  averageWorkoutSeconds,
  weekCompleted,
  weekGoal,
  accentColor
}: StreakCardProps) {
  const theme = useAnthraTheme();
  const activeAccent = accentColor ?? theme.colors.brand;

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.canvas }]}>
      <Background accentColor={activeAccent} />
      <Header accentColor={activeAccent} colors={theme.colors} />
      <Hero streakDays={streakDays} bestStreak={bestStreak} accentColor={activeAccent} colors={theme.colors} />
      <WeeklyProgress weekCompleted={weekCompleted} weekGoal={weekGoal} accentColor={activeAccent} colors={theme.colors} />
      <LifetimeStats
        totalWorkouts={totalWorkouts}
        bestStreak={bestStreak}
        averageWorkoutSeconds={averageWorkoutSeconds}
        accentColor={activeAccent}
        colors={theme.colors}
      />

      <View style={styles.footer}>
        <Text allowFontScaling={false} style={[styles.footerText, { color: theme.colors.textSecondary }]}>#ANTHRA</Text>
      </View>
    </View>
  );
}

function formatAverageWorkoutTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const roundedMinutes = Math.max(1, Math.round(seconds / 60));
  if (roundedMinutes < 60) return `${roundedMinutes} MIN`;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes === 0 ? `${hours} HR` : `${hours}H ${minutes}M`;
}

const styles = StyleSheet.create({
  card: {
    width: STREAK_CARD_WIDTH,
    height: STREAK_CARD_HEIGHT,
    overflow: "hidden"
  },
  topAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 12
  },
  heroWash: {
    position: "absolute",
    top: 250,
    left: 210,
    width: 660,
    height: 820,
    opacity: 0.018
  },
  bottomAccent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    width: 190,
    height: 8,
    opacity: 0.8
  },
  header: {
    position: "absolute",
    top: 112,
    left: 78,
    right: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brand: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 11
  },
  headerMark: {
    width: 54,
    height: 8
  },
  hero: {
    position: "absolute",
    top: 290,
    left: 78,
    right: 78,
    height: 780,
    alignItems: "center"
  },
  heroLabel: {
    fontSize: 25,
    fontWeight: "600",
    letterSpacing: 9
  },
  heroNumberArea: {
    width: 924,
    height: 610,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12
  },
  heroNumber: {
    width: 900,
    fontWeight: "700",
    letterSpacing: -22,
    textAlign: "center"
  },
  heroUnit: {
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: 9
  },
  heroUnderline: {
    width: 84,
    height: 6,
    marginTop: 28
  },
  heroMotivation: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 4,
    marginTop: 20
  },
  weekPanel: {
    position: "absolute",
    top: 1190,
    left: 78,
    right: 78,
    height: 220,
    borderRadius: 30,
    paddingHorizontal: 62,
    paddingVertical: 42,
    borderWidth: 1
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sectionLabel: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 6
  },
  weekCount: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: "700",
    letterSpacing: -2
  },
  weekNumbers: {
    flexDirection: "row",
    alignItems: "baseline",
    flexShrink: 0
  },
  weekDivider: {
    fontSize: 34,
    lineHeight: 60,
    fontWeight: "600",
    marginHorizontal: 14
  },
  weekGoal: {
    fontSize: 34,
    lineHeight: 60,
    fontWeight: "600"
  },
  progressTrack: {
    width: WEEK_PROGRESS_WIDTH,
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    marginTop: 35
  },
  progressFill: {
    height: 12,
    borderRadius: 6
  },
  lifetimePanel: {
    position: "absolute",
    top: 1545,
    left: 78,
    right: 78,
    paddingTop: 44,
    borderTopWidth: 1
  },
  metricRow: {
    height: 250,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 36
  },
  metric: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  metricDivider: {
    width: 1,
    height: 130
  },
  metricValue: {
    width: 280,
    lineHeight: 120,
    fontWeight: "700",
    letterSpacing: -4,
    textAlign: "center"
  },
  metricLabel: {
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 3,
    textAlign: "center",
    marginTop: 14
  },
  footer: {
    position: "absolute",
    right: 78,
    bottom: 106
  },
  footerText: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: 5
  }
});
