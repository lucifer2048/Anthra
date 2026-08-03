import Constants from "expo-constants";
import { Platform } from "react-native";

import { normalizeDays } from "../../constants/schedule";
import { getDayPartsInTimeZone, zonedDateTimeToTimestamp } from "../../utils/timezone";
import { getCurrentTrackerTasks, getTrackerDayTasks, getTrackers } from "./trackerRepository";
import type { TrackerTask } from "./trackerTypes";

type PermissionResponse = { granted?: boolean; status?: string };
type NotificationModule = {
  AndroidImportance?: { DEFAULT?: number; HIGH?: number };
  getPermissionsAsync?: () => Promise<PermissionResponse>;
  requestPermissionsAsync?: () => Promise<PermissionResponse>;
  setNotificationChannelAsync?: (id: string, options: Record<string, unknown>) => Promise<unknown>;
  scheduleNotificationAsync?: (request: {
    identifier?: string;
    content: { title: string; body: string; sound?: boolean; channelId?: string; data?: Record<string, unknown> };
    trigger: Date | { type: string; date: Date; channelId?: string };
  }) => Promise<string>;
  getAllScheduledNotificationsAsync?: () => Promise<Array<{ identifier: string; content?: { data?: Record<string, unknown> } }>>;
  cancelScheduledNotificationAsync?: (identifier: string) => Promise<void>;
};

export type TrackerNotificationSyncResult = {
  supported: boolean;
  scheduledCount: number;
  message: string;
};

const SOURCE = "tracker-buddy";
const CHANNEL = "tracker-buddy-channel";
const HORIZON_DAYS = 14;
const MAX_NOTIFICATIONS = 64;
let syncing: Promise<TrackerNotificationSyncResult> | null = null;

async function loadModule(): Promise<NotificationModule | null> {
  try {
    return (await import("expo-notifications")) as unknown as NotificationModule;
  } catch {
    return null;
  }
}

function unsupportedExpoGo(): boolean {
  return Platform.OS === "android" &&
    (Constants.appOwnership === "expo" || Constants.executionEnvironment === "storeClient");
}

function granted(response: PermissionResponse | null | undefined): boolean {
  return response?.granted === true || response?.status === "granted";
}

async function clearOwned(notifications: NotificationModule): Promise<void> {
  if (!notifications.getAllScheduledNotificationsAsync || !notifications.cancelScheduledNotificationAsync) return;
  const scheduled = await notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content?.data?.source === SOURCE)
      .map((item) => notifications.cancelScheduledNotificationAsync!(item.identifier).catch(() => undefined))
  );
}

function candidates(task: TrackerTask, now: number): number[] {
  if (!task.notificationEnabled) return [];
  if (task.recurrence === "once") {
    if (!task.onceDate) return [];
    const [year, month, day] = task.onceDate.split("-").map(Number);
    const timestamp = zonedDateTimeToTimestamp(
      year,
      month,
      day,
      task.notificationHour,
      task.notificationMinute,
      task.timezone
    );
    return timestamp > now + 5_000 ? [timestamp] : [];
  }
  const allowedDays = task.recurrence === "daily"
    ? [0, 1, 2, 3, 4, 5, 6]
    : normalizeDays(task.days);
  const result: number[] = [];
  for (let offset = 0; offset <= HORIZON_DAYS; offset += 1) {
    const parts = getDayPartsInTimeZone(now, offset, task.timezone);
    if (!allowedDays.includes(parts.weekday)) continue;
    const timestamp = zonedDateTimeToTimestamp(
      parts.year,
      parts.month,
      parts.day,
      task.notificationHour,
      task.notificationMinute,
      task.timezone
    );
    if (timestamp > now + 5_000) result.push(timestamp);
  }
  return result;
}

async function performSync(): Promise<TrackerNotificationSyncResult> {
  if (unsupportedExpoGo()) {
    return { supported: false, scheduledCount: 0, message: "Notifications require an Anthra development build on Android." };
  }
  const notifications = await loadModule();
  if (!notifications?.scheduleNotificationAsync) {
    return { supported: false, scheduledCount: 0, message: "Notifications are unavailable in this build." };
  }
  const trackers = await getTrackers();
  const tasks = await getCurrentTrackerTasks();
  await clearOwned(notifications);
  const enabled = tasks.filter((task) => task.notificationEnabled);
  if (enabled.length === 0) {
    return { supported: true, scheduledCount: 0, message: "No Tracker Buddy notifications are enabled." };
  }
  let permission = await notifications.getPermissionsAsync?.();
  if (!granted(permission)) permission = await notifications.requestPermissionsAsync?.();
  if (!granted(permission)) {
    return { supported: true, scheduledCount: 0, message: "Notification permission is off. Enable it in device settings." };
  }
  let channelId: string | undefined;
  if (Platform.OS === "android" && notifications.setNotificationChannelAsync) {
    await notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Tracker Buddy",
      description: "Optional alerts for tasks you choose.",
      importance: notifications.AndroidImportance?.HIGH ?? notifications.AndroidImportance?.DEFAULT,
      sound: "default",
      vibrationPattern: [0, 180, 100, 180],
      lightColor: "#C8102E"
    });
    channelId = CHANNEL;
  }

  const trackerNames = new Map(trackers.map((tracker) => [tracker.id, tracker.name]));
  const dayCache = new Map<string, Set<number>>();
  let scheduledCount = 0;
  const now = Date.now();
  const pending = enabled
    .flatMap((task) => candidates(task, now).map((timestamp) => ({ task, timestamp })))
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, MAX_NOTIFICATIONS);

  for (const item of pending) {
    const parts = getDayPartsInTimeZone(item.timestamp, 0, item.task.timezone);
    const dateKey = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
    const cacheKey = `${item.task.trackerId}:${dateKey}`;
    if (!dayCache.has(cacheKey)) {
      const dayTasks = await getTrackerDayTasks(item.task.trackerId, dateKey);
      dayCache.set(cacheKey, new Set(dayTasks.filter((task) => task.done).map((task) => task.id)));
    }
    if (dayCache.get(cacheKey)!.has(item.task.id)) continue;
    await notifications.scheduleNotificationAsync({
      identifier: `tracker-${item.task.id}-${item.timestamp}`,
      content: {
        title: item.task.title,
        body: `${trackerNames.get(item.task.trackerId) ?? "Tracker Buddy"} · Ready when you are`,
        sound: true,
        channelId,
        data: { source: SOURCE, trackerId: item.task.trackerId, taskId: item.task.id, dateKey }
      },
      trigger: Platform.OS === "android"
        ? { type: "date", date: new Date(item.timestamp), channelId }
        : new Date(item.timestamp)
    });
    scheduledCount += 1;
  }
  return {
    supported: true,
    scheduledCount,
    message: `${scheduledCount} upcoming ${scheduledCount === 1 ? "alert" : "alerts"} scheduled.`
  };
}

export async function syncTrackerNotifications(): Promise<TrackerNotificationSyncResult> {
  if (syncing) return syncing;
  syncing = performSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

