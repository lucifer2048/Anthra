import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Alert, AppState, Platform } from "react-native";

import { syncTrackerNotifications } from "../../features/tracker/trackerNotifications";
import { getReminderCompletionEntries, getReminderItems, markReminderOccurrenceDone } from "../../db";
import type { UserSettings, WorkoutPlan } from "../../types";
import { syncWorkoutReminderDelivery } from "../../utils/reminders";
import { syncReminderBuddyNotifications, setupNotificationResponseListener } from "../../utils/reminderBuddy";
import { getScheduledWorkoutDays } from "../../utils/workoutSchedule";
import {
  getAlarmPermissionStatus,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  syncWorkoutAlarmReminders
} from "../../utils/alarmNative";
import { openReminder } from "../navigation";
import type { RefreshDataResult } from "./useAppBootstrap";

type UseNotificationSyncParams = {
  ready: boolean;
  settings: UserSettings;
  plans: WorkoutPlan[];
  refreshData: () => Promise<RefreshDataResult>;
  refreshSettings: () => Promise<UserSettings>;
  refreshDashboard: () => Promise<void>;
  refreshHistory: () => Promise<void>;
  refreshEnabledReminderCount: () => Promise<unknown>;
  workoutFlowBusyRef: MutableRefObject<boolean>;
  isWorkoutFlowBusy: boolean;
};

export function useNotificationSync({
  ready,
  settings,
  plans,
  refreshData,
  refreshSettings,
  refreshDashboard,
  refreshHistory,
  refreshEnabledReminderCount,
  workoutFlowBusyRef,
  isWorkoutFlowBusy
}: UseNotificationSyncParams) {
  const notificationSyncInProgressRef = useRef(false);
  const lastNotificationSyncRef = useRef(0);
  const workoutAlarmPermissionSetupRef = useRef(false);
  const workoutAlarmPermissionPromptVisibleRef = useRef(false);
  const pendingReminderHistoryNavigationRef = useRef(false);

  const promptForWorkoutAlarmPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return false;
    const status = await getAlarmPermissionStatus();
    if (!status.nativeSupported) return false;

    const missingPermission = !status.exactAlarm
      ? {
          title: "Allow alarms & reminders",
          message: "Android requires this system permission for Anthra to ring workout alarms at the exact reminder time.",
          open: openExactAlarmSettings
        }
      : !status.fullScreenIntent
        ? {
            title: "Allow full-screen alarms",
            message: "Allow Anthra to open workout alarms full-screen, including while your phone is locked.",
            open: openFullScreenIntentSettings
          }
        : null;

    if (!missingPermission) {
      workoutAlarmPermissionSetupRef.current = false;
      return true;
    }
    if (workoutAlarmPermissionPromptVisibleRef.current) return false;

    workoutAlarmPermissionPromptVisibleRef.current = true;
    Alert.alert(
      missingPermission.title,
      missingPermission.message,
      [
        {
          text: "Not now",
          style: "cancel",
          onPress: () => {
            workoutAlarmPermissionPromptVisibleRef.current = false;
            workoutAlarmPermissionSetupRef.current = false;
          }
        },
        {
          text: "Open settings",
          onPress: () => {
            workoutAlarmPermissionPromptVisibleRef.current = false;
            workoutAlarmPermissionSetupRef.current = true;
            missingPermission.open().catch((error) => {
              workoutAlarmPermissionSetupRef.current = false;
              Alert.alert(
                "Could not open settings",
                error instanceof Error ? error.message : "Open Android settings and allow alarm access for Anthra."
              );
            });
          }
        }
      ],
      {
        cancelable: true,
        onDismiss: () => {
          workoutAlarmPermissionPromptVisibleRef.current = false;
        }
      }
    );
    return false;
  }, []);

  const syncAllNotifications = useCallback(
    async (nextSettings: UserSettings, nextPlans: WorkoutPlan[], force = false) => {
      if (notificationSyncInProgressRef.current) return false;
      if (!force && Date.now() - lastNotificationSyncRef.current < 15 * 60_000) return false;

      notificationSyncInProgressRef.current = true;
      try {
        const [nextReminders, nextCompletions] = await Promise.all([
          getReminderItems(),
          getReminderCompletionEntries()
        ]);
        await Promise.all([
          syncWorkoutReminderDelivery(
            nextSettings,
            getScheduledWorkoutDays(nextPlans, nextSettings.workoutDays)
          ),
          syncReminderBuddyNotifications(nextReminders, nextCompletions),
          syncTrackerNotifications()
        ]);
        lastNotificationSyncRef.current = Date.now();
        return true;
      } finally {
        notificationSyncInProgressRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    if (!ready) return;
    let cleanup: (() => void) | undefined;
    setupNotificationResponseListener(
      async (reminderId, occurrenceTs) => {
        try {
          await markReminderOccurrenceDone(reminderId, occurrenceTs);
        } catch {
          // Silently ignore - the user can still mark it done in the app.
        }
      },
      () => {
        if (workoutFlowBusyRef.current) {
          pendingReminderHistoryNavigationRef.current = true;
          return;
        }
        openReminder("history");
      }
    ).then((fn) => {
      cleanup = fn;
    });
    return () => cleanup?.();
  }, [ready, workoutFlowBusyRef]);

  useEffect(() => {
    if (isWorkoutFlowBusy) return;
    if (!pendingReminderHistoryNavigationRef.current) return;
    pendingReminderHistoryNavigationRef.current = false;
    openReminder("history");
  }, [isWorkoutFlowBusy]);

  useEffect(() => {
    if (!ready) return;
    const interval = setInterval(() => {
      refreshDashboard().catch(() => undefined);
      refreshHistory().catch(() => undefined);
      refreshEnabledReminderCount().catch(() => undefined);
    }, 60_000);

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        Promise.all([refreshData(), refreshSettings(), refreshEnabledReminderCount()])
          .then(async ([nextData, nextSettings]) => {
            const shouldRetryWorkoutAlarm =
              nextSettings.notificationsEnabled &&
              (nextSettings.reminderDelivery === "alarm" || nextSettings.reminderDelivery === "both");
            if (workoutAlarmPermissionSetupRef.current && shouldRetryWorkoutAlarm) {
              await promptForWorkoutAlarmPermission();
            }
            const syncedEverything = await syncAllNotifications(nextSettings, nextData.plans);
            if (!syncedEverything && shouldRetryWorkoutAlarm) {
              await syncWorkoutAlarmReminders(
                nextSettings,
                getScheduledWorkoutDays(nextData.plans, nextSettings.workoutDays)
              );
            }
          })
          .catch(() => undefined);
      }
    });

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [
    promptForWorkoutAlarmPermission,
    ready,
    refreshDashboard,
    refreshData,
    refreshEnabledReminderCount,
    refreshHistory,
    refreshSettings,
    syncAllNotifications
  ]);

  return {
    syncAllNotifications,
    promptForWorkoutAlarmPermission,
    pendingReminderHistoryNavigationRef
  };
}
