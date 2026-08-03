import Constants from "expo-constants";
import { Platform } from "react-native";

import { normalizeDays } from "../constants/schedule";
import type { UserSettings } from "../types";
import { syncWorkoutAlarmReminders } from "./alarmNative";
import { getDayPartsInTimeZone, getDeviceTimeZone, zonedDateTimeToTimestamp } from "./timezone";

type PermissionResponse = {
  granted?: boolean;
  status?: string;
};

type NotificationModule = {
  AndroidImportance?: {
    DEFAULT?: number;
    HIGH?: number;
    MAX?: number;
  };
  getPermissionsAsync?: () => Promise<PermissionResponse>;
  requestPermissionsAsync?: () => Promise<PermissionResponse>;
  getAllScheduledNotificationsAsync?: () => Promise<
    {
      identifier: string;
      content?: {
        data?: Record<string, unknown>;
      };
    }[]
  >;
  cancelScheduledNotificationAsync?: (identifier: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
  setNotificationChannelAsync?: (
    channelId: string,
    options: {
      name: string;
      importance?: number;
      sound?: string;
      vibrationPattern?: number[];
      lightColor?: string;
      description?: string;
    }
  ) => Promise<unknown>;
  getNotificationChannelAsync?: (channelId: string) => Promise<{ id?: string | null } | null>;
  scheduleNotificationAsync?: (request: {
    content: {
      title: string;
      body: string;
      sound?: boolean;
      channelId?: string;
      color?: string;
      data?: Record<string, unknown>;
    };
    trigger:
      | Date
      | {
          type: string;
          date: Date;
          channelId?: string;
        }
      | {
          type: string;
          weekday: number;
          hour: number;
          minute: number;
          repeats: boolean;
          channelId?: string;
        };
  }) => Promise<string>;
  setNotificationHandler?: (handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner?: boolean;
      shouldShowList?: boolean;
    }>;
  }) => void;
};

export type ReminderSyncResult = {
  supported: boolean;
  scheduledCount: number;
  message: string;
};

const ANDROID_CHANNEL_ID = "workout-reminders";
const WORKOUT_REMINDER_SOURCE = "workout-buddy";
const WORKOUT_SCHEDULE_HORIZON_DAYS = 56;
const MAX_SCHEDULED_WORKOUT_NOTIFICATIONS = 320;
let notificationHandlerConfigured = false;

const REMINDER_MESSAGES = [
  {
    title: "Train now, thank yourself later",
    body: "Your session starts soon. A strong day starts with one set."
  },
  {
    title: "Momentum check",
    body: "You are close to workout time. Open Anthra and keep your streak alive."
  },
  {
    title: "Show up for yourself",
    body: "Even a short workout counts. Start now and build consistency."
  },
  {
    title: "Athlete mode: on",
    body: "Your training window is near. Hit start and own this session."
  }
];

async function loadNotificationsModule(): Promise<NotificationModule | null> {
  try {
    const module = (await import("expo-notifications")) as unknown as NotificationModule;
    return module;
  } catch {
    return null;
  }
}

function isExpoGoClient(): boolean {
  const appOwnership = Constants.appOwnership;
  const executionEnvironment = Constants.executionEnvironment;
  return appOwnership === "expo" || executionEnvironment === "storeClient";
}

function isGranted(response: PermissionResponse | null | undefined): boolean {
  if (!response) return false;
  return response.granted === true || response.status === "granted";
}

function ensureNotificationHandler(notifications: NotificationModule): void {
  if (notificationHandlerConfigured || typeof notifications.setNotificationHandler !== "function") {
    return;
  }

  notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });

  notificationHandlerConfigured = true;
}

async function ensureAndroidChannel(notifications: NotificationModule): Promise<string | undefined> {
  if (Platform.OS !== "android") return undefined;
  if (typeof notifications.setNotificationChannelAsync !== "function") return undefined;

  try {
    await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Motivation reminders",
      description: "Workout reminders to keep your streak and training routine on track.",
      importance: notifications.AndroidImportance?.HIGH ?? notifications.AndroidImportance?.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 350, 180, 350],
      lightColor: "#C8102E"
    });

    if (typeof notifications.getNotificationChannelAsync !== "function") {
      return ANDROID_CHANNEL_ID;
    }

    const channel = await notifications.getNotificationChannelAsync(ANDROID_CHANNEL_ID).catch(() => null);
    return channel?.id === ANDROID_CHANNEL_ID ? ANDROID_CHANNEL_ID : undefined;
  } catch {
    return undefined;
  }
}

async function clearExistingWorkoutNotifications(notifications: NotificationModule): Promise<void> {
  if (
    typeof notifications.getAllScheduledNotificationsAsync !== "function" ||
    typeof notifications.cancelScheduledNotificationAsync !== "function"
  ) {
    // Do NOT call cancelAllScheduledNotificationsAsync here — it would also
    // cancel notifications owned by reminder buddy.  Without per-notification
    // cancel support we simply skip cleanup and let the new batch overlap.
    return;
  }

  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter((item) => item.content?.data?.source === WORKOUT_REMINDER_SOURCE);
  await Promise.all(
    owned.map((item) => notifications.cancelScheduledNotificationAsync?.(item.identifier).catch(() => undefined))
  );
}

export async function syncWorkoutReminders(
  settings: UserSettings,
  workoutDays: number[] = settings.workoutDays
): Promise<ReminderSyncResult> {
  if (Platform.OS === "android" && isExpoGoClient()) {
    return {
      supported: false,
      scheduledCount: 0,
      message: "On Android, reminders require a development build (not Expo Go)."
    };
  }

  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return {
      supported: false,
      scheduledCount: 0,
      message: "Reminder module unavailable on this build."
    };
  }

  if (typeof notifications.scheduleNotificationAsync !== "function") {
    return {
      supported: false,
      scheduledCount: 0,
      message: "Reminder APIs are not available."
    };
  }

  try {
    await clearExistingWorkoutNotifications(notifications);

    const usesNotifications =
      settings.reminderDelivery === "notification" || settings.reminderDelivery === "both";
    if (!settings.notificationsEnabled || !usesNotifications) {
      return {
        supported: true,
        scheduledCount: 0,
        message: settings.notificationsEnabled ? "Workout notifications disabled." : "Reminders disabled."
      };
    }

    let permission = (await notifications.getPermissionsAsync?.().catch(() => null)) ?? null;
    if (!isGranted(permission)) {
      permission = (await notifications.requestPermissionsAsync?.().catch(() => null)) ?? null;
    }

    if (!isGranted(permission)) {
      return {
        supported: true,
        scheduledCount: 0,
        message: "Allow notifications to receive workout reminders."
      };
    }

    ensureNotificationHandler(notifications);
    const channelId = await ensureAndroidChannel(notifications);

    const nowMs = Date.now();
    const timeZone = settings.timezone || getDeviceTimeZone();
    const sourceDays = normalizeDays(workoutDays);
    const scheduledDays = sourceDays.length > 0 ? sourceDays : [0, 1, 2, 3, 4, 5, 6];
    const leadMinutesList = settings.reminderLeadMinutes
      .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
      .filter((value) => Number.isFinite(value))
      .slice(0, 3);
    const effectiveLeadMinutes = Array.from(new Set(leadMinutesList.length > 0 ? leadMinutesList : [60]));
    const daySet = new Set<number>(scheduledDays);
    const hour = Math.min(23, Math.max(0, Math.floor(Number(settings.reminderHour) || 0)));
    const minute = Math.min(59, Math.max(0, Math.floor(Number(settings.reminderMinute) || 0)));

    const seenTimestamps = new Set<number>();
    const candidates: { timestamp: number; messageIndex: number }[] = [];

    for (let dayOffset = 0; dayOffset <= WORKOUT_SCHEDULE_HORIZON_DAYS; dayOffset += 1) {
      const slot = getDayPartsInTimeZone(nowMs, dayOffset, timeZone);
      if (!daySet.has(slot.weekday)) continue;

      const workoutTimestamp = zonedDateTimeToTimestamp(
        slot.year,
        slot.month,
        slot.day,
        hour,
        minute,
        timeZone
      );
      for (let leadIndex = 0; leadIndex < effectiveLeadMinutes.length; leadIndex += 1) {
        const lead = effectiveLeadMinutes[leadIndex];
        const reminderTimestamp = workoutTimestamp - lead * 60_000;
        if (reminderTimestamp <= nowMs + 5_000) continue;
        if (seenTimestamps.has(reminderTimestamp)) continue;
        seenTimestamps.add(reminderTimestamp);
        candidates.push({
          timestamp: reminderTimestamp,
          messageIndex: (slot.weekday + leadIndex) % REMINDER_MESSAGES.length
        });
        if (candidates.length >= MAX_SCHEDULED_WORKOUT_NOTIFICATIONS) {
          break;
        }
      }
      if (candidates.length >= MAX_SCHEDULED_WORKOUT_NOTIFICATIONS) {
        break;
      }
    }

    candidates.sort((a, b) => a.timestamp - b.timestamp);
    let scheduledCount = 0;
    for (const candidate of candidates) {
      const message = REMINDER_MESSAGES[candidate.messageIndex];
      await notifications.scheduleNotificationAsync({
        content: {
          title: message.title,
          body: message.body,
          sound: true,
          color: "#C8102E",
          data: { source: WORKOUT_REMINDER_SOURCE, timezone: timeZone }
        },
        trigger: {
          type: "date",
          date: new Date(candidate.timestamp),
          ...(channelId ? { channelId } : {})
        }
      });
      scheduledCount += 1;
    }

    return {
      supported: true,
      scheduledCount,
      message:
        scheduledCount > 0
          ? `Scheduled ${scheduledCount} reminders in ${timeZone}.`
          : "No reminders scheduled."
    };
  } catch (error) {
    await clearExistingWorkoutNotifications(notifications).catch(() => undefined);
    const reason = error instanceof Error ? error.message : "Unknown reminder error.";
    return {
      supported: true,
      scheduledCount: 0,
      message: `Reminder sync failed: ${reason}`
    };
  }
}

export async function syncWorkoutReminderDelivery(
  settings: UserSettings,
  workoutDays: number[] = settings.workoutDays
): Promise<ReminderSyncResult> {
  const notificationResult = await syncWorkoutReminders(settings, workoutDays);
  const alarmResult = await syncWorkoutAlarmReminders(settings, workoutDays).catch((error) => ({
    supported: true,
    scheduledCount: 0,
    message: `Alarm sync failed: ${error instanceof Error ? error.message : "Unknown alarm error."}`
  }));

  if (!settings.notificationsEnabled) {
    return { supported: true, scheduledCount: 0, message: "Workout reminders disabled." };
  }
  if (settings.reminderDelivery === "notification") return notificationResult;
  if (settings.reminderDelivery === "alarm") return alarmResult;

  const supported = notificationResult.supported && alarmResult.supported;
  return {
    supported,
    scheduledCount: notificationResult.scheduledCount + alarmResult.scheduledCount,
    message: `Notifications: ${notificationResult.message} Alarms: ${alarmResult.message}`
  };
}
