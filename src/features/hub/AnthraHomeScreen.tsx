import { useEffect, type ComponentType } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  FadeInDown,
  useReducedMotion
} from "react-native-reanimated";
import {
  AlarmClock,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  ChartNoAxesCombined,
  Dumbbell,
  Flame,
  Footprints,
  KeyRound,
  ListTodo,
  PersonStanding,
  Settings2,
  Salad,
  Trophy,
  UsersRound,
  type LucideProps
} from "lucide-react-native";

import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import { useAnthraTheme } from "../../design-system";
import type { ActiveWorkoutSnapshot, DashboardStats } from "../../types";
import { AnimatedPressable, Button, Card, InteractiveCard, MetricCard } from "../../components/ui";
import { ProgressBar } from "../../components/ProgressBar";
import { useAccount } from "../account/AccountProvider";
import { ProfileAvatar } from "../account/ProfileAvatar";
import { useSocial } from "../social/SocialProvider";
import {
  getHomeLeaderboardPositions,
  type HomeLeaderboardPosition
} from "../social/homeLeaderboard";

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
  onOpenNutrition: () => void;
  onOpenReminders: () => void;
  onOpenLists: () => void;
  onOpenTracker: () => void;
  onOpenAlarms: () => void;
  onOpenVault: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenAccount: () => void;
  onOpenFriends: () => void;
  onOpenFriendsLeaderboard: () => void;
  onResumeWorkout: () => void;
  onEndWorkout: () => void;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  animateCards?: boolean;
  onCardsAnimated?: () => void;
};

function ActionCard({ action, index, animateCards }: { action: HomeAction; index: number; animateCards: boolean }) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const Icon = action.icon;
  const compact = screenWidth < 360;

  return (
    <Animated.View
      entering={reduceMotion || !animateCards ? undefined : FadeInDown.delay(90 + index * 55).springify().damping(18).stiffness(210)}
      style={{ flex: 1, minWidth: 0 }}
    >
      <InteractiveCard
        onPress={action.onPress}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityHint={action.accessibilityHint ?? action.description}
        style={{ flex: 1 }}
        cardProps={{
          padding: compact ? "small" : "medium",
          style: { flex: 1, minHeight: 132 }
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
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          maxFontSizeMultiplier={1.3}
          style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, marginTop: theme.spacing.md }]}
        >
          {action.label}
        </Text>
        <Text
          numberOfLines={3}
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1.3}
          style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}
        >
          {action.description}
        </Text>
      </InteractiveCard>
    </Animated.View>
  );
}

function Section({ title, actions, startIndex, animateCards }: { title: string; actions: HomeAction[]; startIndex: number; animateCards: boolean }) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const gap = theme.spacing.md;
  const columns = width < 340 || fontScale >= 1.5 ? 1 : 2;
  const rowCount = Math.ceil(actions.length / columns);

  return (
    <View style={{ marginTop: theme.spacing["2xl"] }}>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{title.toUpperCase()}</Text>
      <View style={{ gap }}>
        {Array.from({ length: rowCount }, (_, rowIndex) => {
          const rowActions = actions.slice(rowIndex * columns, rowIndex * columns + columns);

          return (
            <View key={rowActions[0].label} style={{ flexDirection: "row", alignItems: "stretch", gap }}>
              {rowActions.map((action, columnIndex) => (
                <ActionCard
                  key={action.label}
                  action={action}
                  index={startIndex + rowIndex * columns + columnIndex}
                  animateCards={animateCards}
                />
              ))}
              {columns === 2 && rowActions.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function PrimaryAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useAnthraTheme();
  return <Button label={label} icon={ArrowRight} iconPosition="end" onPress={onPress} fullWidth size="large" style={{ marginTop: theme.spacing.xl }} />;
}

function formatLeaderboardValue(position: HomeLeaderboardPosition): string {
  if (position.value == null) return "Not shared";
  if (position.metric === "steps") return `${position.value.toLocaleString()} steps`;
  if (position.metric === "workouts") return `${position.value} ${position.value === 1 ? "workout" : "workouts"}`;
  return `${position.value} ${position.value === 1 ? "day" : "days"}`;
}

function FriendsLeaderboardCard({
  friendCount,
  positions,
  onPress
}: {
  friendCount: number;
  positions: HomeLeaderboardPosition[];
  onPress: () => void;
}) {
  const theme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 390 || fontScale >= 1.25;
  const metrics = positions.map((position) => ({
    ...position,
    label: position.metric === "workouts" ? "Workouts" : position.metric === "streak" ? "Streak" : "Steps",
    icon: position.metric === "workouts" ? Dumbbell : position.metric === "streak" ? Flame : Footprints
  }));

  return (
    <Card style={{ marginTop: theme.spacing.md }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md
        }}
      >
        <View
          style={{
            width: compact ? 42 : 46,
            height: compact ? 42 : 46,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.md,
            borderWidth: 1,
            borderColor: theme.colors.brandBorder,
            backgroundColor: theme.colors.brandSoft
          }}
        >
          <Trophy accessible={false} color={theme.colors.brand} size={compact ? 20 : 22} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[theme.typography.titleMedium, { color: theme.colors.textPrimary }]}
          >
            Friends Leaderboard
          </Text>
          <Text
            numberOfLines={2}
            style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}
          >
            {friendCount} {friendCount === 1 ? "friend" : "friends"} in circle · Opt-in standings
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginTop: theme.spacing.xl }}>
        {metrics.map(({ icon: MetricIcon, ...position }) => {
          const isFirst = position.rank === 1;
          const isRanked = position.rank != null;
          return (
            <View
              key={position.metric}
              style={{
                minWidth: 0,
                minHeight: 88,
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: theme.spacing.xs,
                borderLeftWidth: position.metric === metrics[0]?.metric ? 0 : theme.borderWidths.standard,
                borderLeftColor: theme.colors.divider
              }}
            >
              <View
                style={{
                  width: compact ? 28 : 32,
                  height: compact ? 28 : 32,
                  flexShrink: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: theme.radii.full,
                  backgroundColor: isFirst ? theme.colors.brandSoft : theme.colors.surfaceElevated
                }}
              >
                <MetricIcon
                  accessible={false}
                  color={isFirst ? theme.colors.brand : theme.colors.textSecondary}
                  size={compact ? 14 : 16}
                  strokeWidth={2}
                />
              </View>
              <View style={{ minWidth: 0, alignItems: "center", marginTop: theme.spacing.xs }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  style={[theme.typography.caption, { color: theme.colors.textSecondary, textAlign: "center" }]}
                >
                  {position.label}
                </Text>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={[theme.typography.caption, { color: theme.colors.textPrimary, fontWeight: "600", textAlign: "center", marginTop: theme.spacing.xs }]}
                >
                  {formatLeaderboardValue(position)}
                </Text>
              </View>

              <View style={{ alignItems: "center", marginTop: theme.spacing.xs }}>
                {isRanked ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: theme.spacing.xxs,
                      borderRadius: theme.radii.full,
                      backgroundColor: isFirst ? theme.colors.brandSoft : theme.colors.surfaceElevated
                    }}
                  >
                    <Text
                      style={[
                        theme.typography.caption,
                        {
                          color: isFirst ? theme.colors.brand : theme.colors.textPrimary,
                          fontWeight: "700",
                          fontSize: 12,
                          lineHeight: 14
                        }
                      ]}
                    >
                      #{position.rank}
                    </Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary }]}>
                      /{position.participantCount}
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      paddingHorizontal: theme.spacing.sm,
                      paddingVertical: theme.spacing.xxs,
                      borderRadius: theme.radii.full,
                      backgroundColor: theme.colors.surfaceElevated
                    }}
                  >
                    <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, }]}>
                      Off
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <PrimaryAction label="Go to leaderboard" onPress={onPress} />
    </Card>
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
  onOpenNutrition,
  onOpenReminders,
  onOpenLists,
  onOpenTracker,
  onOpenAlarms,
  onOpenVault,
  onOpenProfile,
  onOpenSettings,
  onOpenAccount,
  onOpenFriends,
  onOpenFriendsLeaderboard,
  onResumeWorkout,
  onEndWorkout,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  animateCards = true,
  onCardsAnimated
}: AnthraHomeScreenProps) {
  const theme = useAnthraTheme();
  const account = useAccount();
  const social = useSocial();
  const backgrounds = useScreenBackgrounds();
  const reduceMotion = useReducedMotion();
  const { fontScale, width } = useWindowDimensions();
  const shouldStackCompactRows = width < 340 || fontScale >= 1.5;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());
  const weeklyPercent = Math.min(100, (stats.weekCompleted / Math.max(1, stats.weekGoal)) * 100);
  const wordmarkWidth = Math.max(
    0,
    Math.min(width, theme.layout.contentMaxWidth) - theme.layout.screenPadding * 2
  );
  const wordmarkFontSize = wordmarkWidth * 0.28;

  useEffect(() => {
    onCardsAnimated?.();
  }, [onCardsAnimated]);

  useEffect(() => {
    social.refresh().catch(() => undefined);
  }, [social.refresh]);

  const homeLeaderboard = social.snapshot && social.snapshot.overview.friends.length > 0
    ? {
        friendCount: social.snapshot.overview.friends.length,
        positions: getHomeLeaderboardPositions(social.snapshot.leaderboard)
      }
    : null;

  const moveActions: HomeAction[] = [
    { label: "Workout", description: "Create plans, follow timed workouts, and track progress", icon: Dumbbell, onPress: onOpenWorkout },
    { label: "Activity", description: "Track your steps, workouts, and movement streaks", icon: Footprints, onPress: onOpenActivity },
    { label: "Nutrition", description: "Log meals, calories, macros, and supplements offline", icon: Salad, onPress: onOpenNutrition }
  ];
  const organizeActions: HomeAction[] = [
    { label: "Reminders", description: `Schedule important reminders and track completion · ${enabledReminderCount} active`, icon: BellRing, onPress: onOpenReminders },
    { label: "Tracker", description: "Build routines and track your daily or weekly progress", icon: ChartNoAxesCombined, onPress: onOpenTracker },
    { label: "Lists", description: "Create simple lists and check off everyday tasks", icon: ListTodo, onPress: onOpenLists },
    { label: "Alarms", description: "Set alarms with optional movement challenges to dismiss", icon: AlarmClock, onPress: onOpenAlarms }
  ];
  const moreActions: HomeAction[] = [
    { label: "Friends", description: "Requests, friends, sharing, and daily leaderboards", icon: UsersRound, onPress: onOpenFriends },
    { label: "Vault", description: "Store your passwords and account details securely", icon: KeyRound, onPress: onOpenVault },
    { label: "Body", description: "Manage your measurements, BMI, and personal goals", icon: PersonStanding, onPress: onOpenProfile },
    { label: "Settings", description: "Customize workouts, reminders, appearance, and backups", icon: Settings2, onPress: onOpenSettings }
  ];

  return (
    <ScreenLayout {...backgrounds.brandWash} safeAreaEdges={["top", "left", "right"]}>
      <View style={{ flex: 1 }}>
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentOffset={{ x: 0, y: initialScrollOffset }}
          onScroll={(event) => onScrollOffsetChange?.(event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          contentContainerStyle={{
            width: "100%",
            maxWidth: theme.layout.contentMaxWidth,
            alignSelf: "center",
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.lg,
            paddingBottom: 0
          }}
        >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: theme.spacing.lg }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[theme.typography.label, { color: theme.colors.brand }]}>ANTHRA</Text>
            <Text
              accessibilityRole="header"
              style={[theme.typography.headline, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}
            >
              Today
            </Text>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.4}
              style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}
            >
              {dateLabel}
            </Text>
          </View>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={account.user ? "Open your profile" : "Sign in to Anthra"}
            onPress={onOpenAccount}
            style={({ pressed }) => ({
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: account.user ? theme.colors.brandBorder : theme.colors.borderStrong,
              backgroundColor: account.user ? theme.colors.brandSoft : theme.colors.surfaceElevated,
              opacity: pressed ? 0.72 : 1
            })}
          >
            <ProfileAvatar
              uri={account.profile?.avatarUrl}
              size={48}
              fallbackColor={account.user ? theme.colors.brand : theme.colors.textSecondary}
              backgroundColor={account.user ? theme.colors.brandSoft : theme.colors.surfaceElevated}
            />
          </AnimatedPressable>
        </View>

        <Animated.View
          entering={reduceMotion || !animateCards ? undefined : FadeInDown.delay(30).springify().damping(19).stiffness(190)}
          style={{ marginTop: theme.spacing["2xl"] }}
        >
        <Card variant="brand">
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
            <MetricCard title="Current streak" value={stats.currentStreak} unit={stats.currentStreak === 1 ? "day" : "days"} style={{ flex: shouldStackCompactRows ? undefined : 1 }} />
            <MetricCard title="This week" value={`${stats.weekCompleted}/${stats.weekGoal}`} unit="workouts" style={{ flex: shouldStackCompactRows ? undefined : 1 }} />
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
          <Card variant="brand" style={{ marginTop: theme.spacing.md }}>
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

        {homeLeaderboard ? (
          <FriendsLeaderboardCard
            friendCount={homeLeaderboard.friendCount}
            positions={homeLeaderboard.positions}
            onPress={onOpenFriendsLeaderboard}
          />
        ) : null}

        <Section title="Move" actions={moveActions} startIndex={0} animateCards={animateCards} />
        <Section title="Organize" actions={organizeActions} startIndex={3} animateCards={animateCards} />
        <Section title="More" actions={moreActions} startIndex={7} animateCards={animateCards} />

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
            Let every action today honor the person you're becoming.
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
      </View>
    </ScreenLayout>
  );
}
