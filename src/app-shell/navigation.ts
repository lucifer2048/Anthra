import { router } from "expo-router";

import type { ReminderTab } from "../components/ReminderTabBar";
import type { WorkoutTab } from "../components/WorkoutTabBar";

export function goHub() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/");
}

export function openHub() {
  router.replace("/");
}

export function openActivity() {
  router.push("/activity");
}

export function openNutrition() {
  router.push("/nutrition");
}

export function openAccount() {
  router.push("/account");
}

export function openFriends(initialTab: "friends" | "leaderboard" = "friends") {
  router.push({ pathname: "/friends", params: { initialTab } });
}

export function openTracker() {
  router.push("/tracker");
}

export function openAlarm() {
  router.push("/alarm");
}

export function openReminder(initialTab?: ReminderTab) {
  router.push(initialTab ? { pathname: "/reminder", params: { initialTab } } : "/reminder");
}

export function openVault() {
  router.push("/vault");
}

export function openList() {
  router.push("/list");
}

export function openWorkout(options?: {
  section?: "workout" | "profile" | "settings";
  tab?: WorkoutTab;
  planListMode?: "all" | "today";
}) {
  router.push({
    pathname: "/workout",
    params: {
      section: options?.section ?? "workout",
      tab: options?.tab ?? "home",
      planListMode: options?.planListMode ?? "all"
    }
  });
}

export function openTimer() {
  router.push("/timer");
}
