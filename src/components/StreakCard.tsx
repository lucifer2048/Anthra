import { Text, View } from "react-native";

type StreakCardProps = {
  streakDays: number;
  streakWeeks: number;
  weekCompleted: number;
  weekGoal: number;
};

const GREEN = "#B8FF4F";
export const STREAK_CARD_WIDTH = 1080;
export const STREAK_CARD_HEIGHT = 2160;

function MotionStreaks() {
  const streaks = [
    { top: 220, left: -220, width: 1550, height: 10, opacity: 0.05 },
    { top: 620, left: -180, width: 1450, height: 8, opacity: 0.04 },
    { top: 980, left: -260, width: 1650, height: 12, opacity: 0.06 },
    { top: 1380, left: -170, width: 1400, height: 8, opacity: 0.04 },
    { top: 1760, left: -240, width: 1600, height: 10, opacity: 0.05 },
    { top: 2060, left: -180, width: 1450, height: 8, opacity: 0.04 }
  ];

  return (
    <>
      {streaks.map((s, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.width,
            height: s.height,
            backgroundColor: GREEN,
            opacity: s.opacity,
            transform: [{ rotate: "-8deg" }],
          }}
        />
      ))}
    </>
  );
}

export function StreakCard({ streakDays, streakWeeks, weekCompleted, weekGoal }: StreakCardProps) {
  const clampedGoal = Math.max(1, weekGoal);
  const progress = Math.min(100, Math.round((Math.max(0, weekCompleted) / clampedGoal) * 100));

  const motivationalLine =
    progress >= 100
      ? "You crushed your goal this week."
      : progress >= 60
      ? "You're on track. Keep pushing."
      : "One session at a time. You've got this.";

  return (
    <View
      style={{
        height: STREAK_CARD_HEIGHT,
        width: STREAK_CARD_WIDTH,
        backgroundColor: "#060606",
        overflow: "hidden",
      }}
    >
      <MotionStreaks />

      {/* ── TOP BAR ── */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          paddingTop: 120,
          paddingHorizontal: 80,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 34,
            fontWeight: "900",
            color: "#FFFFFF",
            letterSpacing: 10,
            textTransform: "uppercase",
          }}
        >
          ANTHRA
        </Text>
        <View
          style={{
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.2)",
            borderRadius: 40,
            paddingHorizontal: 30,
            paddingVertical: 12,
          }}
        >
          <Text
            style={{
            fontSize: 22,
            fontWeight: "700",
            color: "rgba(255,255,255,0.7)",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
          >
            Streak Report
          </Text>
        </View>
      </View>

      {/* ── CENTER HERO ── */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 160,
        }}
      >
        {/* Eyebrow */}
        <Text
          style={{
            fontSize: 30,
            fontWeight: "700",
            color: "rgba(255,255,255,0.75)",
            letterSpacing: 10,
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Day Streak
        </Text>

        {/* Giant number */}
        <Text
          style={{
            fontSize: 420,
            fontWeight: "900",
            color: GREEN,
            lineHeight: 380,
            letterSpacing: -20,
            textAlign: "center",
          }}
        >
          {streakDays}
        </Text>

        {/* Divider */}
        <View
          style={{
            width: 100,
            height: 3,
            backgroundColor: GREEN,
            opacity: 0.6,
            marginTop: 64,
            marginBottom: 64,
          }}
        />

        {/* Motivational line */}
        <Text
          style={{
            fontSize: 44,
            fontWeight: "600",
            color: "#FFFFFF",
            textAlign: "center",
            letterSpacing: 0.5,
            lineHeight: 64,
            maxWidth: 860,
            paddingHorizontal: 40,
          }}
        >
          {motivationalLine}
        </Text>
      </View>

      {/* ── BOTTOM STATS ── */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 80,
          paddingBottom: 130,
        }}
      >
        <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginBottom: 56 }} />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          {/* Sessions */}
          <View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "rgba(255,255,255,0.68)",
                letterSpacing: 5,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Workout Days
            </Text>
            <Text
              style={{
                fontSize: 80,
                fontWeight: "900",
                color: "#FFFFFF",
                lineHeight: 80,
              }}
            >
              {weekCompleted}
              <Text style={{ fontSize: 40, color: "rgba(255,255,255,0.3)", fontWeight: "400" }}>
                /{clampedGoal}
              </Text>
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: 3,
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              This week
            </Text>
          </View>

          {/* Vertical divider */}
          <View style={{ width: 1, height: 120, backgroundColor: "rgba(255,255,255,0.1)" }} />

          {/* Week */}
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "700",
                color: "rgba(255,255,255,0.68)",
                letterSpacing: 5,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Week
            </Text>
            <Text
              style={{
                fontSize: 80,
                fontWeight: "900",
                color: GREEN,
                lineHeight: 80,
              }}
            >
              {Math.max(1, streakWeeks + 1)}
            </Text>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: "rgba(255,255,255,0.55)",
                letterSpacing: 3,
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              In progress
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
