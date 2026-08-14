import { useCallback, type MutableRefObject } from "react";

import {
  goHub,
  openAccount,
  openActivity,
  openAlarm,
  openFriends,
  openList,
  openNutrition,
  openReminder,
  openTracker,
  openVault,
  openWorkout
} from "../navigation";

export function useAppNavigationHandlers(hubScrollOffsetRef: MutableRefObject<number>) {
  const onOpenWorkout = useCallback(() => {
    openWorkout({ tab: "home", planListMode: "all" });
  }, []);

  const onChooseTodayWorkout = useCallback(() => {
    openWorkout({ tab: "plans", planListMode: "today" });
  }, []);

  const onOpenActivity = useCallback(() => openActivity(), []);
  const onOpenNutrition = useCallback(() => openNutrition(), []);
  const onOpenReminders = useCallback(() => openReminder(), []);
  const onOpenTracker = useCallback(() => openTracker(), []);
  const onOpenLists = useCallback(() => openList(), []);
  const onOpenAlarms = useCallback(() => openAlarm(), []);
  const onOpenVault = useCallback(() => openVault(), []);
  const onOpenProfile = useCallback(() => openWorkout({ section: "profile" }), []);
  const onOpenSettings = useCallback(() => openWorkout({ section: "settings" }), []);
  const onOpenAccount = useCallback(() => openAccount(), []);
  const onOpenFriends = useCallback(() => openFriends("friends"), []);
  const onOpenFriendsLeaderboard = useCallback(() => openFriends("leaderboard"), []);
  const onHubScrollOffsetChange = useCallback((offset: number) => {
    hubScrollOffsetRef.current = Math.max(0, offset);
  }, [hubScrollOffsetRef]);
  const onOpenAccountFromFriends = useCallback(() => openAccount(), []);
  const onReminderBack = useCallback(() => goHub(), []);

  return {
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
    onHubScrollOffsetChange,
    onOpenAccountFromFriends,
    onReminderBack
  };
}
