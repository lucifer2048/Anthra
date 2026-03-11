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
  streakWeeks: number;
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

export type UserSettings = {
  workoutDays: number[];
  weeklyGoal: number;
  reminderHour: number;
  reminderMinute: number;
  reminderLeadMinutes: number[];
  notificationsEnabled: boolean;
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
