export type TrackerRecurrence = "daily" | "weekdays" | "once";

export type Tracker = {
  id: number;
  name: string;
  createdDate: string;
  createdAt: number;
  updatedAt: number;
};

export type TrackerTask = {
  id: number;
  trackerId: number;
  versionId: number;
  title: string;
  recurrence: TrackerRecurrence;
  days: number[];
  onceDate: string | null;
  notificationEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  timezone: string;
  validFrom: string;
  validTo: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type TrackerTaskInput = {
  id?: number;
  trackerId: number;
  title: string;
  recurrence: TrackerRecurrence;
  days: number[];
  onceDate: string | null;
  notificationEnabled: boolean;
  notificationHour: number;
  notificationMinute: number;
  timezone: string;
};

export type TrackerCompletion = {
  taskId: number;
  versionId: number;
  dateKey: string;
  completedAt: number;
};

export type TrackerDayTask = TrackerTask & {
  dateKey: string;
  done: boolean;
  completedAt: number | null;
};

export type TrackerDayResult = {
  dateKey: string;
  due: number;
  done: number;
  percentage: number | null;
};

export type TrackerPeriodSummary = {
  startDate: string;
  endDate: string;
  due: number;
  done: number;
  percentage: number;
  perfectDays: number;
  activeDays: number;
  streak: number;
  days: TrackerDayResult[];
};

export type TrackerTaskPerformance = {
  taskId: number;
  title: string;
  due: number;
  done: number;
  missed: number;
  pending: number;
  percentage: number;
  days: TrackerTaskPerformanceDay[];
};

export type TrackerTaskPerformanceDay = {
  dateKey: string;
  status: "done" | "missed" | "pending" | "notScheduled";
};
