import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";

import {
  REMINDER_BUDDY_SOURCE,
  REMINDER_MARK_DONE_ACTION_ID,
  REMINDER_SNOOZE_ACTION_ID,
  REMINDER_NOTIFICATION_TASK
} from "../constants/notifications";
import { initDatabase, markReminderOccurrenceDone } from "../db";

type NotificationActionTaskPayload = {
  actionIdentifier?: unknown;
  notification?: {
    request?: {
      identifier?: unknown;
      content?: {
        title?: unknown;
        body?: unknown;
        data?: Record<string, unknown>;
      };
    };
  };
};

if (!TaskManager.isTaskDefined(REMINDER_NOTIFICATION_TASK)) {
  TaskManager.defineTask<NotificationActionTaskPayload>(
    REMINDER_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (
        error ||
        (data?.actionIdentifier !== REMINDER_MARK_DONE_ACTION_ID &&
          data?.actionIdentifier !== REMINDER_SNOOZE_ACTION_ID)
      ) return;

      const request = data.notification?.request;
      const contentData = request?.content?.data;
      if (!contentData || contentData.source !== REMINDER_BUDDY_SOURCE) return;

      const reminderId = typeof contentData.reminderId === "number" ? contentData.reminderId : 0;
      const occurrenceTs = typeof contentData.occurrenceTs === "number" ? contentData.occurrenceTs : 0;
      if (reminderId <= 0 || occurrenceTs <= 0) return;

      if (data.actionIdentifier === REMINDER_MARK_DONE_ACTION_ID) {
        await initDatabase();
        await markReminderOccurrenceDone(reminderId, occurrenceTs);
      } else {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: typeof request.content?.title === "string" ? request.content.title : "Reminder Buddy",
            body: typeof request.content?.body === "string" ? request.content.body : "Snoozed reminder",
            sound: true,
            categoryIdentifier: "reminder-buddy-actions",
            data: { ...contentData, snoozed: true }
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: new Date(Date.now() + 10 * 60_000)
          }
        });
      }

      if (typeof request?.identifier === "string") {
        await Notifications.dismissNotificationAsync(request.identifier).catch(() => undefined);
      }
    }
  );
}

TaskManager.isAvailableAsync()
  .then((available) => {
    if (available) return Notifications.registerTaskAsync(REMINDER_NOTIFICATION_TASK);
    return null;
  })
  .catch(() => undefined);
