import Constants from "expo-constants";
import { Platform } from "react-native";

import { normalizeDays } from "../constants/schedule";
import type { ReminderCompletionEntry, ReminderItem } from "../types";

type PermissionResponse = {
  granted?: boolean;
  status?: string;
};

type ScheduledNotification = {
  identifier: string;
  content?: {
    data?: Record<string, unknown>;
  };
};

type NotificationModule = {
  AndroidImportance?: {
    DEFAULT?: number;
    HIGH?: number;
  };
  getPermissionsAsync?: () => Promise<PermissionResponse>;
  requestPermissionsAsync?: () => Promise<PermissionResponse>;
  setNotificationChannelAsync?: (
    channelId: string,
    options: {
      name: string;
      importance?: number;
      sound?: string;
      vibrationPattern?: number[];
      description?: string;
      lightColor?: string;
    }
  ) => Promise<unknown>;
  getNotificationChannelAsync?: (channelId: string) => Promise<{ id?: string | null } | null>;
  setNotificationHandler?: (handler: {
    handleNotification: () => Promise<{
      shouldShowAlert: boolean;
      shouldPlaySound: boolean;
      shouldSetBadge: boolean;
      shouldShowBanner?: boolean;
      shouldShowList?: boolean;
    }>;
  }) => void;
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
        };
  }) => Promise<string>;
  getAllScheduledNotificationsAsync?: () => Promise<ScheduledNotification[]>;
  cancelScheduledNotificationAsync?: (identifier: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
};

export type ReminderBuddySyncResult = {
  supported: boolean;
  scheduledCount: number;
  message: string;
};

const IST_OFFSET_MINUTES = 330;
const SOURCE_KEY = "reminder-buddy";
const ANDROID_CHANNEL_ID = "reminder-buddy-channel";
const SCHEDULE_HORIZON_DAYS = 21;
const MAX_SCHEDULED_NOTIFICATIONS = 320;
const FOLLOW_UP_DELAY_MS = 15 * 60_000;
let notificationHandlerConfigured = false;

function isExpoGoClient(): boolean {
  const appOwnership = Constants.appOwnership;
  const executionEnvironment = Constants.executionEnvironment;
  return appOwnership === "expo" || executionEnvironment === "storeClient";
}

async function loadNotificationsModule(): Promise<NotificationModule | null> {
  try {
    const module = (await import("expo-notifications")) as unknown as NotificationModule;
    return module;
  } catch {
    return null;
  }
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
      name: "Reminder Buddy",
      description: "Custom reminders scheduled in IST.",
      importance: notifications.AndroidImportance?.HIGH ?? notifications.AndroidImportance?.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 280, 140, 280],
      lightColor: "#52B7FF"
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

function toIstDayParts(baseMs: number, dayOffset: number): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const shifted = baseMs + IST_OFFSET_MINUTES * 60_000;
  const baseIstDate = new Date(shifted);
  const utcMs = Date.UTC(
    baseIstDate.getUTCFullYear(),
    baseIstDate.getUTCMonth(),
    baseIstDate.getUTCDate() + dayOffset,
    0,
    0,
    0,
    0
  );
  const dayDate = new Date(utcMs);
  return {
    year: dayDate.getUTCFullYear(),
    month: dayDate.getUTCMonth() + 1,
    day: dayDate.getUTCDate(),
    weekday: dayDate.getUTCDay()
  };
}

function istToUtcTimestamp(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - IST_OFFSET_MINUTES * 60_000;
}

async function clearExistingReminderBuddyNotifications(notifications: NotificationModule): Promise<void> {
  if (
    typeof notifications.getAllScheduledNotificationsAsync !== "function" ||
    typeof notifications.cancelScheduledNotificationAsync !== "function"
  ) {
    await notifications.cancelAllScheduledNotificationsAsync?.();
    return;
  }

  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter((item) => item.content?.data?.source === SOURCE_KEY);
  await Promise.all(
    owned.map((item) => notifications.cancelScheduledNotificationAsync?.(item.identifier).catch(() => undefined))
  );
}

function nextReminderCandidates(reminder: ReminderItem, nowMs: number): number[] {
  if (!reminder.enabled) return [];

  const allowedDays = normalizeDays(reminder.days);
  const effectiveDays = allowedDays.length > 0 ? allowedDays : [0, 1, 2, 3, 4, 5, 6];
  const daySet = new Set<number>(effectiveDays);
  const candidates: number[] = [];

  if (reminder.mode === "once") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reminder.dateLabel ?? "");
    if (!match) return [];

    const timestamp = istToUtcTimestamp(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      reminder.hour,
      reminder.minute
    );
    return timestamp > nowMs + 5_000 ? [timestamp] : [];
  }

  if (reminder.mode === "time") {
    for (let dayOffset = 0; dayOffset <= SCHEDULE_HORIZON_DAYS; dayOffset += 1) {
      const slot = toIstDayParts(nowMs, dayOffset);
      if (!daySet.has(slot.weekday)) continue;
      const timestamp = istToUtcTimestamp(slot.year, slot.month, slot.day, reminder.hour, reminder.minute);
      if (timestamp > nowMs + 5_000) {
        candidates.push(timestamp);
      }
    }
    return candidates;
  }

  if (reminder.mode === "multi") {
    for (let dayOffset = 0; dayOffset <= SCHEDULE_HORIZON_DAYS; dayOffset += 1) {
      const slot = toIstDayParts(nowMs, dayOffset);
      if (!daySet.has(slot.weekday)) continue;

      for (const timeSlot of reminder.timeSlots) {
        const timestamp = istToUtcTimestamp(slot.year, slot.month, slot.day, timeSlot.hour, timeSlot.minute);
        if (timestamp > nowMs + 5_000) {
          candidates.push(timestamp);
        }
        if (candidates.length >= MAX_SCHEDULED_NOTIFICATIONS) {
          return candidates;
        }
      }
    }

    candidates.sort((left, right) => left - right);
    return Array.from(new Set(candidates)).slice(0, MAX_SCHEDULED_NOTIFICATIONS);
  }

  const interval = Math.max(5, Math.floor(reminder.intervalMinutes ?? 0));
  const startHour = Math.min(23, Math.max(0, Math.floor(reminder.intervalStartHour ?? 8)));
  const startMinute = Math.min(59, Math.max(0, Math.floor(reminder.intervalStartMinute ?? 0)));
  const endHour = Math.min(23, Math.max(0, Math.floor(reminder.intervalEndHour ?? 22)));
  const endMinute = Math.min(59, Math.max(0, Math.floor(reminder.intervalEndMinute ?? 0)));
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;

  if (endTotal <= startTotal) return [];

  for (let dayOffset = 0; dayOffset <= SCHEDULE_HORIZON_DAYS; dayOffset += 1) {
    const slot = toIstDayParts(nowMs, dayOffset);
    if (!daySet.has(slot.weekday)) continue;

    for (let cursor = startTotal; cursor <= endTotal; cursor += interval) {
      const hour = Math.floor(cursor / 60);
      const minute = cursor % 60;
      const timestamp = istToUtcTimestamp(slot.year, slot.month, slot.day, hour, minute);
      if (timestamp > nowMs + 5_000) {
        candidates.push(timestamp);
      }
      if (candidates.length >= MAX_SCHEDULED_NOTIFICATIONS) {
        return candidates;
      }
    }
  }

  return candidates;
}

export async function syncReminderBuddyNotifications(
  reminders: ReminderItem[],
  completions: ReminderCompletionEntry[] = []
): Promise<ReminderBuddySyncResult> {
  if (Platform.OS === "android" && isExpoGoClient()) {
    return {
      supported: false,
      scheduledCount: 0,
      message: "On Android, notifications require a development build (not Expo Go)."
    };
  }

  const notifications = await loadNotificationsModule();
  if (!notifications || typeof notifications.scheduleNotificationAsync !== "function") {
    return {
      supported: false,
      scheduledCount: 0,
      message: "Notification module unavailable in this build."
    };
  }

  try {
    await clearExistingReminderBuddyNotifications(notifications);

    const activeReminders = reminders.filter((reminder) => reminder.enabled);
    if (activeReminders.length === 0) {
      return {
        supported: true,
        scheduledCount: 0,
        message: "No active reminders to schedule."
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
        message: "Allow notifications to receive reminders."
      };
    }

    ensureNotificationHandler(notifications);
    const channelId = await ensureAndroidChannel(notifications);

    const nowMs = Date.now();
    const completedOccurrenceKeys = new Set(
      completions.map((entry) => `${entry.reminderId}:${entry.occurrenceTs}`)
    );
    let scheduledCount = 0;

    for (const reminder of activeReminders) {
      const candidates = nextReminderCandidates(reminder, nowMs);
      for (const occurrenceTs of candidates) {
        if (completedOccurrenceKeys.has(`${reminder.id}:${occurrenceTs}`)) {
          continue;
        }
        if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
          break;
        }

        const notificationPlan = [
          {
            timestamp: occurrenceTs,
            body: reminder.note.trim().length > 0 ? reminder.note.trim() : "Reminder Buddy check-in",
            followUp: false
          },
          {
            timestamp: occurrenceTs + FOLLOW_UP_DELAY_MS,
            body:
              reminder.note.trim().length > 0
                ? `Still pending: ${reminder.note.trim()}`
                : "Still pending. Mark this reminder as done once you finish it.",
            followUp: true
          }
        ];

        for (const plan of notificationPlan) {
          if (plan.timestamp <= nowMs + 5_000) {
            continue;
          }
          if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
            break;
          }

          await notifications.scheduleNotificationAsync({
            content: {
              title: reminder.title,
              body: plan.body,
              sound: true,
              color: "#52B7FF",
              data: {
                source: SOURCE_KEY,
                reminderId: reminder.id,
                occurrenceTs,
                followUp: plan.followUp
              }
            },
            trigger: {
              type: "date",
              date: new Date(plan.timestamp),
              ...(channelId ? { channelId } : {})
            }
          });
          scheduledCount += 1;
        }
      }

      if (scheduledCount >= MAX_SCHEDULED_NOTIFICATIONS) {
        break;
      }
    }

    return {
      supported: true,
      scheduledCount,
      message:
        scheduledCount > 0
          ? `Scheduled ${scheduledCount} notification${scheduledCount === 1 ? "" : "s"} (IST).`
          : "No upcoming reminders in the current schedule window."
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown reminder sync error.";
    return {
      supported: true,
      scheduledCount: 0,
      message: `Reminder sync failed: ${reason}`
    };
  }
}
