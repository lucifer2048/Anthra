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
