export type TimerPhase = "ready" | "work" | "rest" | "complete";

export type Exercise = {
  id?: number;
  name: string;
  workSeconds: number;
  restSeconds: number;
};

export type WorkoutSection = {
  id?: number;
  name: string;
  loops: number;
  restSeconds: number;
  exercises: Exercise[];
};

export type WorkoutPlan = {
  id: number;
  name: string;
  loops: number;
  exercises: Exercise[];
  sections: WorkoutSection[];
  workoutDays: number[];
  createdAt: number;
};

export type WorkoutPlanInput = {
  id?: number;
  name: string;
  loops: number;
  exercises: Exercise[];
  sections: WorkoutSection[];
  workoutDays: number[];
};

export type DashboardStats = {
  currentStreak: number;
  bestStreak: number;
  streakWeeks: number;
  totalWorkouts: number;
  averageWorkoutSeconds: number;
  weekCompleted: number;
  weekGoal: number;
};

export type WorkoutRunSummary = {
  completed: boolean;
  progressPercent: number;
  completedSegments: number;
  totalSegments: number;
  elapsedSeconds: number;
};

export type WorkoutTimerState = {
  phase: Exclude<TimerPhase, "complete">;
  segmentIndex: number;
  remainingSeconds: number;
  isRunning: boolean;
  startedAt: number;
  summary: WorkoutRunSummary;
};

export type ActiveWorkoutSnapshot = {
  sessionId: number;
  plan: WorkoutPlan;
  timer: WorkoutTimerState;
  updatedAt: number;
};

export type WorkoutHistoryEntry = {
  id: number;
  planId: number | null;
  planName: string;
  startedAt: number;
  endedAt: number | null;
  progressPercent: number;
  completedSegments: number;
  totalSegments: number;
  elapsedSeconds: number;
  completed: boolean;
  rating: number | null;
  comment: string;
};

export type UserProfile = {
  heightCm: number | null;
  weightKg: number | null;
  goal: string;
};

export type WorkoutReminderDelivery = "notification" | "alarm" | "both";

export type UserSettings = {
  workoutDays: number[];
  weeklyGoal: number;
  reminderHour: number;
  reminderMinute: number;
  reminderLeadMinutes: number[];
  notificationsEnabled: boolean;
  reminderDelivery: WorkoutReminderDelivery;
  timezone: string;
};

export type ReminderMode = "time" | "interval" | "multi" | "once";

export type ReminderTimeSlot = {
  hour: number;
  minute: number;
};

export type ReminderItem = {
  id: number;
  title: string;
  note: string;
  mode: ReminderMode;
  hour: number;
  minute: number;
  dateLabel: string | null;
  days: number[];
  timeSlots: ReminderTimeSlot[];
  intervalMinutes: number | null;
  intervalStartHour: number | null;
  intervalStartMinute: number | null;
  intervalEndHour: number | null;
  intervalEndMinute: number | null;
  enabled: boolean;
  timezone: string;
  createdAt: number;
  updatedAt: number;
};

export type ReminderInput = {
  id?: number;
  title: string;
  note: string;
  mode: ReminderMode;
  hour: number;
  minute: number;
  dateLabel: string | null;
  days: number[];
  timeSlots: ReminderTimeSlot[];
  intervalMinutes: number | null;
  intervalStartHour: number | null;
  intervalStartMinute: number | null;
  intervalEndHour: number | null;
  intervalEndMinute: number | null;
  enabled: boolean;
  timezone: string;
};

export type ReminderCompletionEntry = {
  id: number;
  reminderId: number;
  occurrenceTs: number;
  completedAt: number;
};

export type AlarmItem = {
  id: number;
  label: string;
  hour: number;
  minute: number;
  days: number[];
  pushupTarget: number;
  soundUri: string;
  soundName: string;
  enabled: boolean;
  timezone: "Asia/Kolkata";
  createdAt: number;
  updatedAt: number;
};

export type AlarmInput = {
  id?: number;
  label: string;
  hour: number;
  minute: number;
  days: number[];
  pushupTarget: number;
  soundUri: string;
  soundName: string;
  enabled: boolean;
};

export type AlarmCompletionStatus = "completed" | "emergency_stopped";

export type AlarmCompletionEvent = {
  eventId: string;
  alarmId: number | null;
  label: string;
  firedAt: number;
  completedAt: number;
  targetReps: number;
  completedReps: number;
  status: AlarmCompletionStatus;
};

export type AlarmHistoryEntry = AlarmCompletionEvent & {
  id: number;
};

export type VaultEntry = {
  id: number;
  appName: string;
  accountId: string;
  secret: string;
  createdAt: number;
  updatedAt: number;
};

export type VaultEntryInput = {
  id?: number;
  appName: string;
  accountId: string;
  secret: string;
};

export type VaultSecuritySettings = {
  hasPin: boolean;
  biometricsEnabled: boolean;
};

export type ListBuddyItem = {
  id: number;
  categoryId: number;
  text: string;
  completed: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type ListBuddyItemInput = {
  id?: number;
  categoryId: number;
  text: string;
  completed: boolean;
};

export type ListBuddyCategory = {
  id: number;
  name: string;
  totalItems: number;
  completedItems: number;
  previewItems: ListBuddyItem[];
  createdAt: number;
  updatedAt: number;
};

export type ListBuddyCategoryInput = {
  id?: number;
  name: string;
};
