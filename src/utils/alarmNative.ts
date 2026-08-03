import { NativeModules, Platform } from "react-native";

import type { AlarmCompletionEvent, AlarmItem, UserSettings } from "../types";
import { buildWorkoutAlarmSlots } from "./workoutAlarmSchedule";

export type AlarmPermissionStatus = {
  nativeSupported: boolean;
  exactAlarm: boolean;
  fullScreenIntent: boolean;
};

export type AlarmSoundChoice = {
  uri: string;
  name: string;
};

export type NativeScheduleResult = {
  nextTriggerAt: number;
};

type AnthraAlarmNativeModule = {
  scheduleAlarm: (alarm: Record<string, unknown>) => Promise<NativeScheduleResult>;
  cancelAlarm: (alarmId: number) => Promise<void>;
  clearAllAlarms: () => Promise<void>;
  pickAlarmSound: (currentUri: string) => Promise<AlarmSoundChoice>;
  getPermissionStatus: () => Promise<AlarmPermissionStatus>;
  openExactAlarmSettings: () => Promise<void>;
  openFullScreenIntentSettings: () => Promise<void>;
  startTestChallenge: (target: number) => Promise<void>;
  consumeCompletionEvents: () => Promise<AlarmCompletionEvent[]>;
};

const nativeAlarm = NativeModules.AnthraAlarm as AnthraAlarmNativeModule | undefined;

function requireNativeAlarm(): AnthraAlarmNativeModule {
  if (Platform.OS !== "android" || !nativeAlarm) {
    throw new Error("Alarm Buddy requires an Android development build. It is not available in Expo Go.");
  }
  return nativeAlarm;
}

type NativeAlarmConfig = Pick<
  AlarmItem,
  "id" | "label" | "hour" | "minute" | "days" | "pushupTarget" | "soundUri" | "soundName" | "enabled"
> & { timezone: string };
// Alarm Buddy alarms require camera-verified push-ups. Workout reminders do not.
type NativeAlarmPayload = NativeAlarmConfig & { requiresPushups: boolean };

export type WorkoutAlarmSyncResult = {
  supported: boolean;
  scheduledCount: number;
  message: string;
};

const WORKOUT_ALARM_IDS = [-10_001, -10_002, -10_003] as const;

function toNativeAlarm(alarm: NativeAlarmPayload): Record<string, unknown> {
  return {
    id: alarm.id,
    label: alarm.label,
    hour: alarm.hour,
    minute: alarm.minute,
    days: alarm.days,
    pushupTarget: alarm.pushupTarget,
    soundUri: alarm.soundUri,
    soundName: alarm.soundName,
    enabled: alarm.enabled,
    timezone: alarm.timezone,
    requiresPushups: alarm.requiresPushups
  };
}

export function isNativeAlarmSupported(): boolean {
  return Platform.OS === "android" && Boolean(nativeAlarm);
}

export async function scheduleNativeAlarm(alarm: AlarmItem): Promise<NativeScheduleResult> {
  return requireNativeAlarm().scheduleAlarm(
    toNativeAlarm({ ...alarm, timezone: alarm.timezone, requiresPushups: true })
  );
}

export async function syncWorkoutAlarmReminders(
  settings: UserSettings,
  workoutDays: number[] = settings.workoutDays
): Promise<WorkoutAlarmSyncResult> {
  const usesAlarm = settings.reminderDelivery === "alarm" || settings.reminderDelivery === "both";
  if (!settings.notificationsEnabled || !usesAlarm) {
    if (isNativeAlarmSupported()) {
      const module = requireNativeAlarm();
      await Promise.all(WORKOUT_ALARM_IDS.map((id) => module.cancelAlarm(id).catch(() => undefined)));
    }
    return { supported: true, scheduledCount: 0, message: "Workout alarms disabled." };
  }

  if (!isNativeAlarmSupported()) {
    return {
      supported: false,
      scheduledCount: 0,
      message: "Workout alarms require an Android development build."
    };
  }

  const module = requireNativeAlarm();
  await Promise.all(WORKOUT_ALARM_IDS.map((id) => module.cancelAlarm(id).catch(() => undefined)));

  const slots = buildWorkoutAlarmSlots(
    settings.reminderHour,
    settings.reminderMinute,
    settings.reminderLeadMinutes,
    workoutDays
  );
  let scheduledCount = 0;

  try {
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const config: NativeAlarmPayload = {
        id: WORKOUT_ALARM_IDS[index],
        label: slot.leadMinutes === 0 ? "Workout starts now" : `Workout in ${slot.leadMinutes} minutes`,
        hour: slot.hour,
        minute: slot.minute,
        days: slot.days,
        pushupTarget: 1,
        soundUri: "",
        soundName: "System alarm",
        enabled: true,
        timezone: settings.timezone,
        requiresPushups: false
      };
      await module.scheduleAlarm(toNativeAlarm(config));
      scheduledCount += 1;
    }
  } catch (error) {
    await Promise.all(WORKOUT_ALARM_IDS.map((id) => module.cancelAlarm(id).catch(() => undefined)));
    throw error;
  }

  return {
    supported: true,
    scheduledCount,
    message: `Scheduled ${scheduledCount} workout alarm${scheduledCount === 1 ? "" : "s"}.`
  };
}

export async function cancelNativeAlarm(alarmId: number): Promise<void> {
  return requireNativeAlarm().cancelAlarm(alarmId);
}

export async function replaceNativeAlarms(alarms: AlarmItem[]): Promise<void> {
  if (!isNativeAlarmSupported()) return;
  const module = requireNativeAlarm();
  await module.clearAllAlarms();
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    await module.scheduleAlarm(toNativeAlarm({ ...alarm, requiresPushups: true }));
  }
}

export async function pickNativeAlarmSound(currentUri = ""): Promise<AlarmSoundChoice> {
  return requireNativeAlarm().pickAlarmSound(currentUri);
}

export async function getAlarmPermissionStatus(): Promise<AlarmPermissionStatus> {
  if (!isNativeAlarmSupported()) {
    return { nativeSupported: false, exactAlarm: false, fullScreenIntent: false };
  }
  return requireNativeAlarm().getPermissionStatus();
}

export async function openExactAlarmSettings(): Promise<void> {
  return requireNativeAlarm().openExactAlarmSettings();
}

export async function openFullScreenIntentSettings(): Promise<void> {
  return requireNativeAlarm().openFullScreenIntentSettings();
}

export async function startPushupTrackingTest(target: number): Promise<void> {
  return requireNativeAlarm().startTestChallenge(Math.min(100, Math.max(1, Math.floor(target))));
}

export async function consumeNativeAlarmCompletions(): Promise<AlarmCompletionEvent[]> {
  if (!isNativeAlarmSupported()) return [];
  return requireNativeAlarm().consumeCompletionEvents();
}
