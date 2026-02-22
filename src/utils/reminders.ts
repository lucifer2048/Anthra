import Constants from "expo-constants";
import { Platform } from "react-native";

import { normalizeDays } from "../constants/schedule";
import type { UserSettings } from "../types";

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
  SchedulableTriggerInputTypes?: {
    WEEKLY?: string;
  };
  getPermissionsAsync?: () => Promise<PermissionResponse>;
  requestPermissionsAsync?: () => Promise<PermissionResponse>;
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
  ) => Promise<void>;
  scheduleNotificationAsync?: (request: {
    content: {
      title: string;
      body: string;
      sound?: boolean;
      channelId?: string;
      color?: string;
    };
    trigger: {
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

function toExpoWeekday(jsWeekday: number): number {
  return jsWeekday === 0 ? 1 : jsWeekday + 1;
}

function toReminderSlot(
  day: number,
  hour: number,
  minute: number,
  leadMinutes: number
): { day: number; hour: number; minute: number } {
  let dayCursor = day;
  let minuteOffset = hour * 60 + minute - leadMinutes;

  while (minuteOffset < 0) {
    minuteOffset += 24 * 60;
    dayCursor = (dayCursor + 6) % 7;
  }

  while (minuteOffset >= 24 * 60) {
    minuteOffset -= 24 * 60;
    dayCursor = (dayCursor + 1) % 7;
  }

  return {
    day: dayCursor,
    hour: Math.floor(minuteOffset / 60),
    minute: minuteOffset % 60
  };
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

async function ensureAndroidChannel(notifications: NotificationModule): Promise<void> {
  if (Platform.OS !== "android") return;
  if (typeof notifications.setNotificationChannelAsync !== "function") return;

  await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Motivation reminders",
    description: "Workout reminders to keep your streak and training routine on track.",
    importance: notifications.AndroidImportance?.HIGH ?? notifications.AndroidImportance?.DEFAULT,
    sound: "default",
    vibrationPattern: [0, 350, 180, 350],
    lightColor: "#52B7FF"
  });
}

export async function syncWorkoutReminders(settings: UserSettings): Promise<ReminderSyncResult> {
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

  if (
    typeof notifications.cancelAllScheduledNotificationsAsync !== "function" ||
    typeof notifications.scheduleNotificationAsync !== "function"
  ) {
    return {
      supported: false,
      scheduledCount: 0,
      message: "Reminder APIs are not available."
    };
  }

  try {
    await notifications.cancelAllScheduledNotificationsAsync();

    if (!settings.notificationsEnabled) {
      return {
        supported: true,
        scheduledCount: 0,
        message: "Reminders disabled."
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
    await ensureAndroidChannel(notifications);

    const sourceDays = normalizeDays(settings.workoutDays);
    const scheduledDays = sourceDays.length > 0 ? sourceDays : [0, 1, 2, 3, 4, 5, 6];
    const weeklyTriggerType = notifications.SchedulableTriggerInputTypes?.WEEKLY ?? "weekly";
    const leadMinutesList = settings.reminderLeadMinutes
      .map((value) => Math.max(0, Math.floor(Number(value) || 0)))
      .filter((value) => Number.isFinite(value))
      .slice(0, 3);
    const effectiveLeadMinutes = leadMinutesList.length > 0 ? leadMinutesList : [60];

    const seenTriggers = new Set<string>();
    let scheduledCount = 0;

    for (const day of scheduledDays) {
      for (let leadIndex = 0; leadIndex < effectiveLeadMinutes.length; leadIndex += 1) {
        const lead = effectiveLeadMinutes[leadIndex];
        const slot = toReminderSlot(
          day,
          Math.min(23, Math.max(0, settings.reminderHour)),
          Math.min(59, Math.max(0, settings.reminderMinute)),
          lead
        );

        const triggerKey = `${slot.day}-${slot.hour}-${slot.minute}`;
        if (seenTriggers.has(triggerKey)) continue;
        seenTriggers.add(triggerKey);

        const message = REMINDER_MESSAGES[(day + leadIndex) % REMINDER_MESSAGES.length];
        await notifications.scheduleNotificationAsync({
          content: {
            title: message.title,
            body: message.body,
            sound: true,
            color: "#52B7FF",
            ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {})
          },
          trigger: {
            type: weeklyTriggerType,
            weekday: toExpoWeekday(slot.day),
            hour: slot.hour,
            minute: slot.minute,
            repeats: true,
            ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {})
          }
        });
        scheduledCount += 1;
      }
    }

    return {
      supported: true,
      scheduledCount,
      message: scheduledCount > 0 ? `Scheduled ${scheduledCount} reminders.` : "No reminders scheduled."
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown reminder error.";
    return {
      supported: true,
      scheduledCount: 0,
      message: `Reminder sync failed: ${reason}`
    };
  }
}
