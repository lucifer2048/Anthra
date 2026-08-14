import { AnthraHomeScreen } from "../src/features/hub/AnthraHomeScreen";
import { useAppShell } from "../src/app-shell/AppShellContext";

export default function HubRoute() {
  const {
    stats,
    todayWorkoutPlans,
    enabledReminderCount,
    recoverableWorkout,
    onOpenWorkout,
    onChooseTodayWorkout,
    onOpenActivity,
    onOpenNutrition,
    onOpenReminders,
    onOpenTracker,
    onOpenLists,
    onOpenAlarms,
    onOpenVault,
    onOpenProfile,
    onOpenSettings,
    onOpenAccount,
    onOpenFriends,
    onOpenFriendsLeaderboard,
    resumeInterruptedWorkout,
    endInterruptedWorkout,
    hubScrollOffsetRef,
    onHubScrollOffsetChange,
    hasAnimatedHubCards,
    handleHubCardsAnimated
  } = useAppShell();

  return (
    <AnthraHomeScreen
      stats={stats}
      todayWorkoutCount={todayWorkoutPlans.length}
      enabledReminderCount={enabledReminderCount}
      recoverableWorkout={recoverableWorkout}
      onOpenWorkout={onOpenWorkout}
      onChooseTodayWorkout={onChooseTodayWorkout}
      onOpenActivity={onOpenActivity}
      onOpenNutrition={onOpenNutrition}
      onOpenReminders={onOpenReminders}
      onOpenTracker={onOpenTracker}
      onOpenLists={onOpenLists}
      onOpenAlarms={onOpenAlarms}
      onOpenVault={onOpenVault}
      onOpenProfile={onOpenProfile}
      onOpenSettings={onOpenSettings}
      onOpenAccount={onOpenAccount}
      onOpenFriends={onOpenFriends}
      onOpenFriendsLeaderboard={onOpenFriendsLeaderboard}
      onResumeWorkout={resumeInterruptedWorkout}
      onEndWorkout={endInterruptedWorkout}
      initialScrollOffset={hubScrollOffsetRef.current}
      onScrollOffsetChange={onHubScrollOffsetChange}
      animateCards={!hasAnimatedHubCards}
      onCardsAnimated={handleHubCardsAnimated}
    />
  );
}
