import Constants from "expo-constants";
import { Platform } from "react-native";

import { normalizeDays } from "../constants/schedule";
import {
  REMINDER_BUDDY_SOURCE,
  REMINDER_MARK_DONE_ACTION_ID,
  REMINDER_SNOOZE_ACTION_ID
} from "../constants/notifications";
import type { ReminderCompletionEntry, ReminderItem } from "../types";
import { getDayPartsInTimeZone, getDeviceTimeZone, zonedDateTimeToTimestamp } from "./timezone";

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

type NotificationResponse = {
  actionIdentifier: string;
  notification: {
    request: {
      identifier: string;
      content: {
        data?: Record<string, unknown>;
      };
    };
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
  setNotificationCategoryAsync?: (
    categoryId: string,
    actions: Array<{
      identifier: string;
      buttonTitle: string;
      options?: { opensAppToForeground?: boolean };
    }>
  ) => Promise<unknown>;
  scheduleNotificationAsync?: (request: {
    identifier?: string;
    content: {
      title: string;
      body: string;
      sound?: boolean;
      channelId?: string;
      color?: string;
      categoryIdentifier?: string;
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
  addNotificationResponseReceivedListener?: (
    listener: (response: NotificationResponse) => void
  ) => { remove: () => void };
  getLastNotificationResponseAsync?: () => Promise<NotificationResponse | null>;
  clearLastNotificationResponseAsync?: () => Promise<void>;
  dismissNotificationAsync?: (identifier: string) => Promise<void>;
};

export type ReminderBuddySyncResult = {
  supported: boolean;
  scheduledCount: number;
  message: string;
};

const SOURCE_KEY = REMINDER_BUDDY_SOURCE;
const ANDROID_CHANNEL_ID = "reminder-buddy-channel";
const NOTIFICATION_CATEGORY_ID = "reminder-buddy-actions";
const MARK_DONE_ACTION_ID = REMINDER_MARK_DONE_ACTION_ID;
const SNOOZE_ACTION_ID = REMINDER_SNOOZE_ACTION_ID;
const SCHEDULE_HORIZON_DAYS = 7;
const MAX_SCHEDULED_NOTIFICATIONS = 64;
let notificationHandlerConfigured = false;
let notificationCategoryConfigured = false;

/** Mutex to prevent concurrent syncs from causing duplicate notifications. */
let syncInProgress = false;
let syncQueued = false;
let queuedArgs: {
  reminders: ReminderItem[];
  completions: ReminderCompletionEntry[];
} | null = null;

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

async function ensureNotificationCategory(notifications: NotificationModule): Promise<void> {
  if (notificationCategoryConfigured || typeof notifications.setNotificationCategoryAsync !== "function") {
    return;
  }

  try {
    await notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORY_ID, [
      {
        identifier: MARK_DONE_ACTION_ID,
        buttonTitle: "Mark Done",
        options: { opensAppToForeground: false }
      },
      {
        identifier: SNOOZE_ACTION_ID,
        buttonTitle: "Snooze 10m",
        options: { opensAppToForeground: false }
      }
    ]);
    notificationCategoryConfigured = true;
  } catch {
    // Category setup failed - notifications will still work, just without action buttons
  }
}

async function ensureAndroidChannel(notifications: NotificationModule): Promise<string | undefined> {
  if (Platform.OS !== "android") return undefined;
  if (typeof notifications.setNotificationChannelAsync !== "function") return undefined;

  try {
    await notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Reminder Buddy",
      description: "Custom reminders scheduled in your selected timezone.",
      importance: notifications.AndroidImportance?.HIGH ?? notifications.AndroidImportance?.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 280, 140, 280],
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

async function clearExistingReminderBuddyNotifications(notifications: NotificationModule): Promise<void> {
  if (
    typeof notifications.getAllScheduledNotificationsAsync !== "function" ||
    typeof notifications.cancelScheduledNotificationAsync !== "function"
  ) {
    // Do NOT call cancelAllScheduledNotificationsAsync here — it would also
    // cancel notifications owned by workout buddy.  Without per-notification
    // cancel support we simply skip cleanup and let the new batch overlap.
    return;
  }

  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  const owned = scheduled.filter(
    (item) => item.content?.data?.source === SOURCE_KEY && item.content?.data?.snoozed !== true
  );
  await Promise.all(
    owned.map((item) => notifications.cancelScheduledNotificationAsync?.(item.identifier).catch(() => undefined))
  );
}

function nextReminderCandidates(reminder: ReminderItem, nowMs: number): number[] {
  if (!reminder.enabled) return [];

  const timeZone = reminder.timezone || getDeviceTimeZone();

  const allowedDays = normalizeDays(reminder.days);
  const effectiveDays = allowedDays.length > 0 ? allowedDays : [0, 1, 2, 3, 4, 5, 6];
  const daySet = new Set<number>(effectiveDays);
  const candidates: number[] = [];

  if (reminder.mode === "once") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reminder.dateLabel ?? "");
    if (!match) return [];

    const timestamp = zonedDateTimeToTimestamp(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
      reminder.hour,
      reminder.minute,
      timeZone
    );
    return timestamp > nowMs + 5_000 ? [timestamp] : [];
  }

  if (reminder.mode === "time") {
    for (let dayOffset = 0; dayOffset <= SCHEDULE_HORIZON_DAYS; dayOffset += 1) {
      const slot = getDayPartsInTimeZone(nowMs, dayOffset, timeZone);
      if (!daySet.has(slot.weekday)) continue;
      const timestamp = zonedDateTimeToTimestamp(
        slot.year,
        slot.month,
        slot.day,
        reminder.hour,
        reminder.minute,
        timeZone
      );
      if (timestamp > nowMs + 5_000) {
        candidates.push(timestamp);
      }
    }
    return candidates;
  }

  if (reminder.mode === "multi") {
    for (let dayOffset = 0; dayOffset <= SCHEDULE_HORIZON_DAYS; dayOffset += 1) {
      const slot = getDayPartsInTimeZone(nowMs, dayOffset, timeZone);
      if (!daySet.has(slot.weekday)) continue;

      for (const timeSlot of reminder.timeSlots) {
        const timestamp = zonedDateTimeToTimestamp(
          slot.year,
          slot.month,
          slot.day,
          timeSlot.hour,
          timeSlot.minute,
          timeZone
        );
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
    const slot = getDayPartsInTimeZone(nowMs, dayOffset, timeZone);
    if (!daySet.has(slot.weekday)) continue;

    for (let cursor = startTotal; cursor <= endTotal; cursor += interval) {
      const hour = Math.floor(cursor / 60);
      const minute = cursor % 60;
      const timestamp = zonedDateTimeToTimestamp(
        slot.year,
        slot.month,
        slot.day,
        hour,
        minute,
        timeZone
      );
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

async function performSync(
  reminders: ReminderItem[],
  completions: ReminderCompletionEntry[]
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
    await ensureNotificationCategory(notifications);
    const channelId = await ensureAndroidChannel(notifications);

    const nowMs = Date.now();
    const completedOccurrenceKeys = new Set(
      completions.map((entry) => `${entry.reminderId}:${entry.occurrenceTs}`)
    );
    const perReminderLimit = Math.max(1, Math.floor(MAX_SCHEDULED_NOTIFICATIONS / activeReminders.length));
    const upcoming = activeReminders
      .flatMap((reminder) =>
        nextReminderCandidates(reminder, nowMs)
          .filter((occurrenceTs) => !completedOccurrenceKeys.has(`${reminder.id}:${occurrenceTs}`))
          .slice(0, perReminderLimit)
          .map((occurrenceTs) => ({ reminder, occurrenceTs }))
      )
      .sort((left, right) => left.occurrenceTs - right.occurrenceTs)
      .slice(0, MAX_SCHEDULED_NOTIFICATIONS);

    let scheduledCount = 0;
    for (const { reminder, occurrenceTs } of upcoming) {
      const identifier = `anthra-reminder-${reminder.id}-${occurrenceTs}`;
      await notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: reminder.title,
          body: reminder.note.trim().length > 0 ? reminder.note.trim() : "Reminder Buddy check-in",
          sound: true,
          color: "#C8102E",
          categoryIdentifier: NOTIFICATION_CATEGORY_ID,
          ...(channelId ? { channelId } : {}),
          data: {
            source: SOURCE_KEY,
            reminderId: reminder.id,
            occurrenceTs
          }
        },
        trigger: {
          type: "date",
          date: new Date(occurrenceTs),
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
          ? `Scheduled ${scheduledCount} notification${scheduledCount === 1 ? "" : "s"}.`
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

export async function syncReminderBuddyNotifications(
  reminders: ReminderItem[],
  completions: ReminderCompletionEntry[] = []
): Promise<ReminderBuddySyncResult> {
  if (syncInProgress) {
    // Queue the latest request so we don't lose it, but skip duplicate syncs
    syncQueued = true;
    queuedArgs = { reminders, completions };
    return {
      supported: true,
      scheduledCount: 0,
      message: "Sync already in progress, queued."
    };
  }

  syncInProgress = true;
  try {
    let result = await performSync(reminders, completions);

    // Always process the newest queued state before releasing the mutex.
    while (syncQueued && queuedArgs) {
      syncQueued = false;
      const nextArgs = queuedArgs;
      queuedArgs = null;
      try {
        result = await performSync(nextArgs.reminders, nextArgs.completions);
      } catch {
        // Preserve the most recent successful result.
      }
    }

    return result;
  } finally {
    syncInProgress = false;
    syncQueued = false;
    queuedArgs = null;
  }
}

/**
 * Sets up a listener for notification responses (e.g. "Mark Done" action button).
 * Returns a cleanup function to remove the listener.
 */
export async function setupNotificationResponseListener(
  onMarkDone: (reminderId: number, occurrenceTs: number) => Promise<void> | void,
  onOpenReminder?: (reminderId: number) => Promise<void> | void
): Promise<() => void> {
  const notifications = await loadNotificationsModule();
  if (!notifications || typeof notifications.addNotificationResponseReceivedListener !== "function") {
    return () => {};
  }

  const handleResponse = (response: NotificationResponse) => {
    const data = response.notification?.request?.content?.data;
    if (!data || data.source !== SOURCE_KEY) return;

    const reminderId = typeof data.reminderId === "number" ? data.reminderId : 0;
    const occurrenceTs = typeof data.occurrenceTs === "number" ? data.occurrenceTs : 0;

    if (reminderId <= 0) return;

    if (response.actionIdentifier !== MARK_DONE_ACTION_ID) {
      if (response.actionIdentifier !== SNOOZE_ACTION_ID) {
        Promise.resolve(onOpenReminder?.(reminderId)).catch(() => undefined);
      }
      notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      return;
    }

    if (occurrenceTs <= 0) return;

    Promise.resolve(onMarkDone(reminderId, occurrenceTs))
      .then(() =>
        notifications.dismissNotificationAsync?.(response.notification.request.identifier).catch(() => undefined)
      )
      .finally(() => {
        notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
      });
  };

  const subscription = notifications.addNotificationResponseReceivedListener(handleResponse);
  const lastResponse = await notifications.getLastNotificationResponseAsync?.().catch(() => null);
  if (lastResponse) handleResponse(lastResponse);

  return () => subscription.remove();
}
