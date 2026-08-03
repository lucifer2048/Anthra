import Constants from "expo-constants";
import { Platform } from "react-native";

import { REMINDER_BUDDY_SOURCE } from "../constants/notifications";

const WORKOUT_SOURCE = "workout-buddy";

type PermissionResponse = {
  granted?: boolean;
  status?: string;
};

type ScheduledRequest = {
  content?: { data?: Record<string, unknown> };
  trigger?: Record<string, unknown> | null;
};

type NotificationModule = {
  getPermissionsAsync?: () => Promise<PermissionResponse>;
  requestPermissionsAsync?: () => Promise<PermissionResponse>;
  getAllScheduledNotificationsAsync?: () => Promise<ScheduledRequest[]>;
  scheduleNotificationAsync?: (request: {
    content: { title: string; body: string; sound: boolean; data: Record<string, unknown> };
    trigger: null;
  }) => Promise<string>;
};

export type NotificationHealth = {
  supported: boolean;
  permission: "granted" | "denied" | "undetermined" | "unavailable";
  scheduledCount: number;
  workoutCount: number;
  reminderCount: number;
  nextTriggerAt: number | null;
  nextWorkoutTriggerAt: number | null;
  nextReminderTriggerAt: number | null;
};

function isExpoGoClient(): boolean {
  return Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient";
}

async function loadNotifications(): Promise<NotificationModule | null> {
  try {
    return (await import("expo-notifications")) as unknown as NotificationModule;
  } catch {
    return null;
  }
}

function permissionLabel(permission: PermissionResponse | null): NotificationHealth["permission"] {
  if (!permission) return "unavailable";
  if (permission.granted || permission.status === "granted") return "granted";
  if (permission.status === "denied") return "denied";
  return "undetermined";
}

function triggerTimestamp(trigger: Record<string, unknown> | null | undefined): number | null {
  if (!trigger) return null;
  const raw = Number(trigger.timestamp ?? trigger.date ?? trigger.value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 1_000_000_000_000 ? raw * 1000 : raw;
}

export async function getNotificationHealth(): Promise<NotificationHealth> {
  if (Platform.OS === "android" && isExpoGoClient()) {
    return {
      supported: false,
      permission: "unavailable",
      scheduledCount: 0,
      workoutCount: 0,
      reminderCount: 0,
      nextTriggerAt: null,
      nextWorkoutTriggerAt: null,
      nextReminderTriggerAt: null
    };
  }

  const notifications = await loadNotifications();
  if (!notifications) {
    return {
      supported: false,
      permission: "unavailable",
      scheduledCount: 0,
      workoutCount: 0,
      reminderCount: 0,
      nextTriggerAt: null,
      nextWorkoutTriggerAt: null,
      nextReminderTriggerAt: null
    };
  }

  const [permission, scheduled] = await Promise.all([
    notifications.getPermissionsAsync?.().catch(() => null) ?? Promise.resolve(null),
    notifications.getAllScheduledNotificationsAsync?.().catch(() => []) ?? Promise.resolve([])
  ]);
  const owned = scheduled.filter((request) => {
    const source = request.content?.data?.source;
    return source === WORKOUT_SOURCE || source === REMINDER_BUDDY_SOURCE;
  });
  const futureTriggers = owned
    .map((request) => triggerTimestamp(request.trigger))
    .filter((timestamp): timestamp is number => timestamp != null && timestamp > Date.now())
    .sort((left, right) => left - right);
  const workoutRequests = owned.filter(
    (request) => request.content?.data?.source === WORKOUT_SOURCE
  );
  const reminderRequests = owned.filter(
    (request) => request.content?.data?.source === REMINDER_BUDDY_SOURCE
  );
  const nextFutureTrigger = (requests: ScheduledRequest[]): number | null =>
    requests
      .map((request) => triggerTimestamp(request.trigger))
      .filter((timestamp): timestamp is number => timestamp != null && timestamp > Date.now())
      .sort((left, right) => left - right)[0] ?? null;

  return {
    supported: true,
    permission: permissionLabel(permission),
    scheduledCount: owned.length,
    workoutCount: workoutRequests.length,
    reminderCount: reminderRequests.length,
    nextTriggerAt: futureTriggers[0] ?? null,
    nextWorkoutTriggerAt: nextFutureTrigger(workoutRequests),
    nextReminderTriggerAt: nextFutureTrigger(reminderRequests)
  };
}

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  if (Platform.OS === "android" && isExpoGoClient()) {
    return { ok: false, message: "Test notifications require a development build." };
  }

  const notifications = await loadNotifications();
  if (!notifications?.scheduleNotificationAsync) {
    return { ok: false, message: "Notifications are unavailable in this build." };
  }

  let permission = (await notifications.getPermissionsAsync?.().catch(() => null)) ?? null;
  if (!(permission?.granted || permission?.status === "granted")) {
    permission = (await notifications.requestPermissionsAsync?.().catch(() => null)) ?? null;
  }
  if (!(permission?.granted || permission?.status === "granted")) {
    return { ok: false, message: "Allow notifications to send a test." };
  }

  await notifications.scheduleNotificationAsync({
    content: {
      title: "Anthra notifications are ready",
      body: "This is a test. Your workout and reminder schedules are connected.",
      sound: true,
      data: { source: "anthra-test" }
    },
    trigger: null
  });
  return { ok: true, message: "Test notification sent." };
}
