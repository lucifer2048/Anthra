export type ActivitySourceKind = "health_connect" | "phone_sensor" | "none";
export type ActivityShareScope = "activity" | "all";

export type ActivityTheme = {
  accent: string;
  accentSoft: string;
  accentBorder: string;
  onAccent: string;
};

export type ActivityCapabilities = {
  platform: "android" | "unsupported";
  apiLevel: number;
  stepCounterAvailable: boolean;
  activityRecognitionRequired: boolean;
  healthConnectAvailability:
    | "available"
    | "update_required"
    | "unavailable"
    | "unsupported_os";
};

export type PhoneStepStatus = {
  sensorAvailable: boolean;
  permissionGranted: boolean;
  trackingEnabled: boolean;
  dateKey: string | null;
  timezone: string | null;
  lastRaw: number | null;
  steps: number;
};

export type PhoneStepReading = {
  raw: number;
  dateKey: string;
  timezone: string;
  baselineRaw: number;
  steps: number;
  counterReset: boolean;
  rebootDetected: boolean;
  timezoneChanged: boolean;
  rolledOverDayKey: string | null;
  rolledOverTimezone: string | null;
  rolledOverSteps: number | null;
};

export type PhoneStepDaySnapshot = {
  dateKey: string;
  timezone: string;
  steps: number;
};

export type HealthConnectStatus = {
  availability: ActivityCapabilities["healthConnectAvailability"];
  stepsPermission: boolean;
  exercisePermission: boolean;
  connected: boolean;
};

export type HealthDailyTotal = {
  dateKey: string;
  timezone: string;
  steps: number | null;
  originPackages: string[];
};

export type HealthWorkout = {
  externalId: string;
  clientRecordId: string | null;
  clientRecordVersion: number;
  originPackage: string;
  title: string | null;
  exerciseType: number;
  startTime: number;
  endTime: number;
  lastModifiedTime: number;
};

export type ActivitySettings = {
  dailyGoal: number;
  phoneTrackingEnabled: boolean;
  shareScope: ActivityShareScope;
};

export type ActivityDailySummary = {
  dateKey: string;
  timezone: string;
  phoneSteps: number | null;
  healthConnectSteps: number | null;
  authoritativeSteps: number;
  authoritativeSource: ActivitySourceKind;
  sourcePackages: string[];
  updatedAt: number;
};

export type StoredActivityWorkout = HealthWorkout & {
  id: number;
  durationSeconds: number;
  dateKey: string;
  source: "health_connect";
};

export type ActivitySyncState = {
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  error: string | null;
};
