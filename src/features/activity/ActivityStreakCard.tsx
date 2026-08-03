import { StyleSheet, Text, View } from "react-native";

import type { ActivityShareScope } from "./activityTypes";

export const ACTIVITY_STREAK_CARD_WIDTH = 320;
export const ACTIVITY_STREAK_CARD_HEIGHT = 427;

type ActivityStreakCardProps = {
  scope: ActivityShareScope;
  streak: number;
  todaySteps: number;
  dailyGoal: number;
  activeDaysThisWeek: number;
  sourceLabel: string;
  accentColor?: string;
};

export function ActivityStreakCard({
  scope,
  streak,
  todaySteps,
  dailyGoal,
  activeDaysThisWeek,
  sourceLabel,
  accentColor = "#FF3B4D"
}: ActivityStreakCardProps) {
  const safeStreak = Math.max(0, Math.floor(streak));
  const scopeLabel = scope === "all" ? "ALL MOVEMENT" : "CONNECTED ACTIVITY";
  const progress = Math.min(100, Math.round((todaySteps / Math.max(1, dailyGoal)) * 100));

  return (
    <View style={styles.card}>
      <View style={[styles.topAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.glow, { backgroundColor: accentColor }]} />

      <View style={styles.header}>
        <Text allowFontScaling={false} style={styles.brand}>ANTHRA</Text>
        <View style={[styles.scopePill, { borderColor: accentColor }]}>
          <Text allowFontScaling={false} style={[styles.scope, { color: accentColor }]}>
            {scopeLabel}
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text allowFontScaling={false} style={styles.eyebrow}>YOUR MOMENTUM</Text>
        <Text allowFontScaling={false} style={[styles.streak, { color: accentColor }]}>
          {safeStreak}
        </Text>
        <Text allowFontScaling={false} style={styles.days}>
          {safeStreak === 1 ? "DAY IN A ROW" : "DAYS IN A ROW"}
        </Text>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text allowFontScaling={false} style={styles.metricValue}>
            {Math.max(0, Math.floor(todaySteps)).toLocaleString("en-US")}
          </Text>
          <Text allowFontScaling={false} style={styles.metricLabel}>STEPS TODAY</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metric}>
          <Text allowFontScaling={false} style={styles.metricValue}>
            {Math.max(1, Math.floor(dailyGoal)).toLocaleString("en-US")}
          </Text>
          <Text allowFontScaling={false} style={styles.metricLabel}>DAILY GOAL</Text>
        </View>
      </View>

      <View style={styles.progressHeader}>
        <Text allowFontScaling={false} style={styles.progressLabel}>TODAY’S PROGRESS</Text>
        <Text allowFontScaling={false} style={[styles.progressValue, { color: accentColor }]}>
          {progress}%
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: accentColor }]} />
      </View>
      <View style={styles.weekRow}>
        <Text allowFontScaling={false} style={styles.weekLabel}>ACTIVE DAYS · LAST 7</Text>
        <Text allowFontScaling={false} style={[styles.weekValue, { color: accentColor }]}>
          {activeDaysThisWeek}/7
        </Text>
      </View>

      <View style={styles.footer}>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.source}>
          {sourceLabel.toUpperCase()}
        </Text>
        <Text allowFontScaling={false} style={styles.disclaimer}>
          PERSONAL ACTIVITY ESTIMATE · NOT MEDICAL DATA
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: ACTIVITY_STREAK_CARD_WIDTH,
    height: ACTIVITY_STREAK_CARD_HEIGHT,
    backgroundColor: "#090707",
    overflow: "hidden",
    paddingHorizontal: 22,
    paddingVertical: 24
  },
  topAccent: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 5
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -90,
    top: -105,
    opacity: 0.16
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  brand: {
    color: "#FCF8F8",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 3
  },
  scopePill: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  scope: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1
  },
  hero: {
    alignItems: "center",
    marginTop: 25
  },
  eyebrow: {
    color: "rgba(252,248,248,0.58)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 2
  },
  streak: {
    fontSize: 98,
    lineHeight: 104,
    fontWeight: "900",
    letterSpacing: -4
  },
  days: {
    color: "#FCF8F8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2
  },
  metrics: {
    height: 64,
    marginTop: 22,
    borderWidth: 1,
    borderColor: "rgba(252,248,248,0.12)",
    borderRadius: 14,
    backgroundColor: "rgba(252,248,248,0.04)",
    flexDirection: "row",
    alignItems: "center"
  },
  metric: {
    flex: 1,
    alignItems: "center"
  },
  metricValue: {
    color: "#FCF8F8",
    fontSize: 19,
    fontWeight: "900"
  },
  metricLabel: {
    marginTop: 3,
    color: "rgba(252,248,248,0.52)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1
  },
  divider: {
    height: 32,
    width: 1,
    backgroundColor: "rgba(252,248,248,0.14)"
  },
  progressHeader: {
    marginTop: 17,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  progressLabel: {
    color: "rgba(252,248,248,0.58)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.1
  },
  progressValue: {
    fontSize: 10,
    fontWeight: "900"
  },
  progressTrack: {
    height: 7,
    marginTop: 7,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(252,248,248,0.11)"
  },
  progressFill: {
    height: 7,
    borderRadius: 4
  },
  weekRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  weekLabel: {
    color: "rgba(252,248,248,0.58)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 1.1
  },
  weekValue: {
    fontSize: 13,
    fontWeight: "900"
  },
  footer: {
    marginTop: "auto"
  },
  source: {
    color: "#FCF8F8",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.9
  },
  disclaimer: {
    marginTop: 5,
    color: "rgba(252,248,248,0.38)",
    fontSize: 6,
    fontWeight: "700",
    letterSpacing: 0.65
  }
});
