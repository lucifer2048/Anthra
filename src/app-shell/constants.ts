import { themes } from "../design-system";
import type { DashboardStats, UserSettings } from "../types";
import { getDeviceTimeZone } from "../utils/timezone";
import type { ModuleTheme } from "./AppShellContext";

export const INITIAL_STATS: DashboardStats = {
  currentStreak: 0,
  bestStreak: 0,
  streakWeeks: 0,
  totalWorkouts: 0,
  averageWorkoutSeconds: 0,
  weekCompleted: 0,
  weekGoal: 4
};

export const INITIAL_SETTINGS: UserSettings = {
  workoutDays: [1, 3, 5],
  weeklyGoal: 4,
  reminderHour: 18,
  reminderMinute: 0,
  reminderLeadMinutes: [60],
  notificationsEnabled: false,
  reminderDelivery: "notification",
  timezone: getDeviceTimeZone()
};

export function resolveModuleTheme(isDarkMode: boolean): ModuleTheme {
  const colors = isDarkMode ? themes.dark.colors : themes.light.colors;
  return {
    accent: colors.brand,
    accentSoft: colors.brandSoft,
    accentBorder: colors.brandBorder,
    icon: colors.brand,
    onAccent: colors.textOnBrandSolid
  };
}
