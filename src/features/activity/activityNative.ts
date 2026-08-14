import { NativeModules, PermissionsAndroid, Platform } from "react-native";

import type {
  ActivityCapabilities,
  HealthConnectStatus,
  HealthDailyTotal,
  HealthWorkout,
  PhoneStepDaySnapshot,
  PhoneStepReading,
  PhoneStepStatus
} from "./activityTypes";

type AnthraActivityNativeModule = {
  getCapabilities(): Promise<ActivityCapabilities>;
  getPhoneStepStatus(): Promise<PhoneStepStatus>;
  setPhoneStepTrackingEnabled(enabled: boolean): Promise<void>;
  getCurrentRawStepReading(timezone: string): Promise<PhoneStepReading>;
  cancelCurrentRawStepReading(): void;
  getPendingPhoneStepDays(): Promise<PhoneStepDaySnapshot[]>;
  acknowledgePendingPhoneStepDays(dateKeys: string[]): Promise<void>;
  getHealthConnectStatus(): Promise<HealthConnectStatus>;
  requestHealthConnectPermissions(): Promise<{
    stepsPermission: boolean;
    exercisePermission: boolean;
  }>;
  readHealthConnectDailyTotals(
    startTime: number,
    endTime: number,
    timezone: string
  ): Promise<HealthDailyTotal[]>;
  readHealthConnectWorkouts(
    startTime: number,
    endTime: number
  ): Promise<HealthWorkout[]>;
  openHealthConnectSettings(): Promise<void>;
};

const nativeActivity = NativeModules.AnthraActivity as
  | AnthraActivityNativeModule
  | undefined;

function isNativeActivityAvailable(): boolean {
  return (Platform.OS === "android" || Platform.OS === "ios") && Boolean(nativeActivity);
}

function requireNativeActivity(): AnthraActivityNativeModule {
  if (!isNativeActivityAvailable()) {
    throw new Error("Activity Buddy step and health connections require a development build.");
  }
  return nativeActivity!;
}

export async function getActivityCapabilities(): Promise<ActivityCapabilities> {
  if (!isNativeActivityAvailable()) {
    return {
      platform: "unsupported",
      apiLevel: 0,
      stepCounterAvailable: false,
      activityRecognitionRequired: false,
      healthConnectAvailability: "unsupported_os"
    };
  }
  return nativeActivity!.getCapabilities();
}

export async function getPhoneStepStatus(): Promise<PhoneStepStatus> {
  return requireNativeActivity().getPhoneStepStatus();
}

export async function enablePhoneStepTracking(): Promise<boolean> {
  const bridge = requireNativeActivity();
  const capabilities = await bridge.getCapabilities();
  if (!capabilities.stepCounterAvailable) return false;
  if (
    Platform.OS === "android" &&
    capabilities.activityRecognitionRequired &&
    !(await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION
    ))
  ) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      {
        title: "Enable phone step tracking",
        message:
          "Activity Buddy uses Android's hardware step counter in the background to show your daily steps. Android will display a quiet ongoing notification while tracking.",
        buttonPositive: "Enable",
        buttonNegative: "Not now"
      }
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  await bridge.setPhoneStepTrackingEnabled(true);
  return true;
}

export async function disablePhoneStepTracking(): Promise<void> {
  await requireNativeActivity().setPhoneStepTrackingEnabled(false);
}

export async function getCurrentPhoneStepReading(
  timezone: string
): Promise<PhoneStepReading> {
  return requireNativeActivity().getCurrentRawStepReading(timezone);
}

export function cancelCurrentPhoneStepReading(): void {
  nativeActivity?.cancelCurrentRawStepReading();
}

export async function getPendingPhoneStepDays(): Promise<PhoneStepDaySnapshot[]> {
  return requireNativeActivity().getPendingPhoneStepDays();
}

export async function acknowledgePendingPhoneStepDays(
  dateKeys: string[]
): Promise<void> {
  if (dateKeys.length === 0) return;
  await requireNativeActivity().acknowledgePendingPhoneStepDays(dateKeys);
}

export async function getHealthConnectStatus(): Promise<HealthConnectStatus> {
  if (!isNativeActivityAvailable()) {
    return {
      availability: "unsupported_os",
      stepsPermission: false,
      exercisePermission: false,
      connected: false
    };
  }
  return nativeActivity!.getHealthConnectStatus();
}

export async function requestHealthConnectPermissions() {
  return requireNativeActivity().requestHealthConnectPermissions();
}

export async function readHealthConnectDailyTotals(
  startTime: number,
  endTime: number,
  timezone: string
): Promise<HealthDailyTotal[]> {
  return requireNativeActivity().readHealthConnectDailyTotals(
    startTime,
    endTime,
    timezone
  );
}

export async function readHealthConnectWorkouts(
  startTime: number,
  endTime: number
): Promise<HealthWorkout[]> {
  return requireNativeActivity().readHealthConnectWorkouts(startTime, endTime);
}

export async function openHealthConnectSettings(): Promise<void> {
  return requireNativeActivity().openHealthConnectSettings();
}
