import type { ComponentType } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring
} from "react-native-reanimated";
import {
  AlarmClock,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarCheck2,
  ChartNoAxesCombined,
  Dumbbell,
  Flame,
  Footprints,
  KeyRound,
  ListTodo,
  Settings2,
  UserRound,
  type LucideProps
} from "lucide-react-native";

import { useAnthraTheme } from "../../design-system";
import type { ActiveWorkoutSnapshot, DashboardStats } from "../../types";
import { Button, Card } from "../../components/ui";
import { ProgressBar } from "../../components/ProgressBar";

type HomeAction = {
  label: string;
  description: string;
  icon: ComponentType<LucideProps>;
  onPress: () => void;
  accessibilityHint?: string;
};

type AnthraHomeScreenProps = {
  stats: DashboardStats;
  todayWorkoutCount: number;
  enabledReminderCount: number;
  recoverableWorkout: ActiveWorkoutSnapshot | null;
  onOpenWorkout: () => void;
  onChooseTodayWorkout: () => void;
  onOpenActivity: () => void;
  onOpenReminders: () => void;
  onOpenLists: () => void;
  onOpenTracker: () => void;
  onOpenAlarms: () => void;
  onOpenVault: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onResumeWorkout: () => void;
  onEndWorkout: () => void;
};

function ActionCard({ action, width, index }: { action: HomeAction; width: number | "100%"; index: number }) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const Icon = action.icon;
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return;
    scale.value = withSpring(pressed ? 0.965 : 1, { damping: 17, stiffness: 320, mass: 0.55 });
  };

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(90 + index * 55).springify().damping(18).stiffness(210)}
      style={{ width }}
    >
      <Animated.View style={[{ width: "100%" }, animatedStyle]}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            action.onPress();
          }}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityHint={action.accessibilityHint ?? action.description}
          style={{
            minHeight: 132,
            padding: theme.spacing.lg,
            borderRadius: theme.radii.xl,
            borderWidth: 1,
            borderColor: theme.colors.borderStrong,
            backgroundColor: theme.colors.surfaceElevated,
            shadowColor: theme.isDark ? "#000000" : "#5E2130",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: theme.isDark ? 0.28 : 0.07,
            shadowRadius: 14,
            elevation: 2
          }}
        >
          <View className="flex-row items-start justify-between">
            <View
              className="items-center justify-center"
              style={{
                width: 42,
                height: 42,
                borderRadius: theme.radii.md,
                borderWidth: 1,
                borderColor: theme.colors.brandBorder,
                backgroundColor: theme.colors.brandSoft
              }}
            >
              <Icon accessible={false} color={theme.colors.brand} size={21} strokeWidth={2.2} />
            </View>
            <ArrowUpRight accessible={false} color={theme.colors.textTertiary} size={18} />
          </View>
          <Text numberOfLines={1} style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, marginTop: theme.spacing.md }]}>{action.label}</Text>
          <Text numberOfLines={2} style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: 3 }]}>{action.description}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function Section({ title, actions, startIndex }: { title: string; actions: HomeAction[]; startIndex: number }) {
  const theme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const availableWidth = Math.max(0, Math.min(width, theme.layout.contentMaxWidth) - theme.layout.screenPadding * 2);
  const gap = theme.spacing.md;
  const stackCards = availableWidth < 320 || fontScale >= 1.35;
  const cardWidth: number | "100%" = stackCards ? "100%" : (availableWidth - gap) / 2;

  return (
    <View style={{ marginTop: theme.spacing["2xl"] }}>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{title.toUpperCase()}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {actions.map((action, index) => (
          <ActionCard key={action.label} action={action} width={cardWidth} index={startIndex + index} />
        ))}
      </View>
    </View>
  );
}

function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[{ marginTop: theme.spacing.xl }, animatedStyle]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          onPress();
        }}
        onPressIn={() => {
          if (!reduceMotion) scale.value = withSpring(0.975, { damping: 18, stiffness: 320 });
        }}
        onPressOut={() => {
          if (!reduceMotion) scale.value = withSpring(1, { damping: 16, stiffness: 260 });
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          minHeight: 56,
          width: "100%",
          paddingHorizontal: theme.spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.sm,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: theme.colors.brandSolid,
          borderBottomWidth: 4,
          borderBottomColor: theme.colors.brandPressed,
          backgroundColor: theme.colors.brandSolid
        }}
      >
        <Text style={[theme.typography.labelLarge, { color: theme.colors.textOnBrandSolid }]}>{label}</Text>
        <ArrowRight accessible={false} color={theme.colors.textOnBrandSolid} size={19} />
      </Pressable>
    </Animated.View>
  );
}

export function AnthraHomeScreen({
  stats,
  todayWorkoutCount,
  enabledReminderCount,
  recoverableWorkout,
  onOpenWorkout,
  onChooseTodayWorkout,
  onOpenActivity,
  onOpenReminders,
  onOpenLists,
  onOpenTracker,
  onOpenAlarms,
  onOpenVault,
  onOpenProfile,
  onOpenSettings,
  onResumeWorkout,
  onEndWorkout
}: AnthraHomeScreenProps) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const { fontScale, width } = useWindowDimensions();
  const shouldStackCompactRows = width < 360 || fontScale >= 1.3;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
  const weeklyPercent = Math.min(100, (stats.weekCompleted / Math.max(1, stats.weekGoal)) * 100);
  const wordmarkWidth = width;
  const wordmarkFontSize = wordmarkWidth * 0.28;

  const moveActions: HomeAction[] = [
    { label: "Workout", description: "Plans, guided timer, history, and recovery", icon: Dumbbell, onPress: onOpenWorkout },
    { label: "Activity", description: "Steps, connected workouts, and movement streaks", icon: Footprints, onPress: onOpenActivity }
  ];
  const organizeActions: HomeAction[] = [
    { label: "Reminders", description: `${enabledReminderCount} active · schedules and completion history`, icon: BellRing, onPress: onOpenReminders },
    { label: "Tracker", description: "Daily wins, flexible routines, streaks, and reports", icon: ChartNoAxesCombined, onPress: onOpenTracker },
    { label: "Lists", description: "Capture, group, and complete everyday tasks", icon: ListTodo, onPress: onOpenLists },
    { label: "Alarms", description: "Wake-up alarms with optional movement challenges", icon: AlarmClock, onPress: onOpenAlarms }
  ];
  const moreActions: HomeAction[] = [
    { label: "Vault", description: "Credentials protected by secure storage", icon: KeyRound, onPress: onOpenVault },
    { label: "Profile", description: "Body metrics and personal goals", icon: UserRound, onPress: onOpenProfile },
    { label: "Settings", description: "Schedule, appearance, reminders, and backups", icon: Settings2, onPress: onOpenSettings }
  ];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <StatusBar style={theme.statusBarStyle} backgroundColor={theme.colors.canvas} translucent={false} />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.lg,
          paddingBottom: 0
        }}
      >
        <View>
          <Text style={[theme.typography.label, { color: theme.colors.brand }]}>ANTHRA</Text>
          <Text
            accessibilityRole="header"
            style={[theme.typography.headline, { color: theme.colors.textPrimary, marginTop: 2 }]}
          >
            Today
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: 2 }]}>{dateLabel}</Text>
        </View>

        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.delay(30).springify().damping(19).stiffness(190)}
          style={{ marginTop: theme.spacing["2xl"] }}
        >
        <Card
          variant="brand"
          padding="large"
          style={{
            borderBottomWidth: 3,
            borderBottomColor: theme.colors.brandBorder,
            shadowColor: theme.isDark ? "#000000" : "#6D2436",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: theme.isDark ? 0.25 : 0.07,
            shadowRadius: 18,
            elevation: 3
          }}
        >
          <Text style={[theme.typography.label, { color: theme.colors.brand }]}>TODAY’S FOCUS</Text>
          <Text
            accessibilityRole="header"
            style={[theme.typography.titleLarge, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}
          >
            {todayWorkoutCount > 0
              ? `${todayWorkoutCount} ${todayWorkoutCount === 1 ? "workout is" : "workouts are"} ready`
              : "Your training schedule is open"}
          </Text>
          <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
            {todayWorkoutCount > 0
              ? "Choose the session that fits your energy and time today."
              : "Use the day for recovery, activity, or choose any saved plan."}
          </Text>

          <View style={{ flexDirection: shouldStackCompactRows ? "column" : "row", gap: theme.spacing.sm, marginTop: theme.spacing.xl }}>
            <View
              className="min-w-0"
              style={{
                flex: shouldStackCompactRows ? undefined : 1,
                minHeight: 86,
                padding: theme.spacing.md,
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.colors.brandBorder,
                backgroundColor: theme.colors.surface
              }}
            >
              <View className="flex-row items-center" style={{ gap: theme.spacing.sm }}>
                <Flame accessible={false} color={theme.colors.brand} size={17} />
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>CURRENT STREAK</Text>
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={[theme.typography.titleLarge, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}
              >
                {stats.currentStreak} {stats.currentStreak === 1 ? "day" : "days"}
              </Text>
            </View>
            <View
              className="min-w-0"
              style={{
                flex: shouldStackCompactRows ? undefined : 1,
                minHeight: 86,
                padding: theme.spacing.md,
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.colors.brandBorder,
                backgroundColor: theme.colors.surface
              }}
            >
              <View className="flex-row items-center" style={{ gap: theme.spacing.sm }}>
                <CalendarCheck2 accessible={false} color={theme.colors.brand} size={17} />
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>THIS WEEK</Text>
              </View>
              <Text style={[theme.typography.titleLarge, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}>{stats.weekCompleted}/{stats.weekGoal}</Text>
            </View>
          </View>
          <ProgressBar
            value={weeklyPercent}
            max={100}
            accessibilityLabel="Weekly workout goal progress"
            style={{ marginTop: theme.spacing.xl }}
          />
          <PrimaryAction
            label={todayWorkoutCount > 0 ? "Choose today’s workout" : "Open Move"}
            onPress={todayWorkoutCount > 0 ? onChooseTodayWorkout : onOpenWorkout}
          />
        </Card>
        </Animated.View>

        {recoverableWorkout && (
          <Card padding="large" style={{ marginTop: theme.spacing.md, borderColor: theme.colors.brand }}>
            <Text style={[theme.typography.label, { color: theme.colors.brand }]}>READY TO CONTINUE</Text>
            <Text style={[theme.typography.titleMedium, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}>
              {recoverableWorkout.plan.name}
            </Text>
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              {recoverableWorkout.timer.phase === "ready"
                ? "Your start countdown is waiting."
                : `${recoverableWorkout.timer.phase === "rest" ? "Rest" : "Work"} · ${recoverableWorkout.timer.remainingSeconds}s remaining`}
            </Text>
            <View
              style={{
                flexDirection: shouldStackCompactRows ? "column" : "row",
                gap: theme.spacing.sm,
                marginTop: theme.spacing.lg
              }}
            >
              <Button label="Resume" onPress={onResumeWorkout} fullWidth style={{ flex: shouldStackCompactRows ? undefined : 1, alignSelf: "stretch" }} />
              <Button label="End session" onPress={onEndWorkout} variant="outline" fullWidth style={{ flex: shouldStackCompactRows ? undefined : 1, alignSelf: "stretch" }} />
            </View>
          </Card>
        )}

        <Section title="Move" actions={moveActions} startIndex={0} />
        <Section title="Organize" actions={organizeActions} startIndex={2} />
        <Section title="More" actions={moreActions} startIndex={6} />

        <View
          accessible
          accessibilityRole="text"
          style={{
            alignItems: "center",
            marginTop: theme.spacing["5xl"],
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing["2xl"]
          }}
        >
          <View
            style={{
              width: 32,
              height: 2,
              borderRadius: theme.radii.full,
              backgroundColor: theme.colors.brand
            }}
          />
          <Text
            style={[
              theme.typography.titleSmall,
              {
                maxWidth: 340,
                color: theme.colors.textSecondary,
                marginTop: theme.spacing.lg,
                textAlign: "center",
                lineHeight: 26
              }
            ]}
          >
            Make tomorrow’s you proud of what you do today.
          </Text>
        </View>

        <View
          accessible
          accessibilityRole="text"
          style={{
            width: wordmarkWidth,
            alignSelf: "center",
            marginTop: theme.spacing["3xl"],
            overflow: "hidden",
            paddingBottom: theme.spacing.xs
          }}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            maxFontSizeMultiplier={1}
            style={{
              width: "100%",
              color: theme.colors.brand,
              fontFamily: theme.typography.display.fontFamily,
              fontSize: wordmarkFontSize,
              lineHeight: wordmarkFontSize,
              fontWeight: "900",
              letterSpacing: -wordmarkWidth * 0.012,
              includeFontPadding: false,
              textAlign: "center"
            }}
          >
            ANTHRA
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
