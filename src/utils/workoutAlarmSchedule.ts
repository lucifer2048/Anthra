import { normalizeDays } from "../constants/schedule";

export type WorkoutAlarmSlot = {
  leadMinutes: number;
  hour: number;
  minute: number;
  days: number[];
};

export function buildWorkoutAlarmSlots(
  workoutHour: number,
  workoutMinute: number,
  leadMinutes: number[],
  workoutDays: number[]
): WorkoutAlarmSlot[] {
  const days = normalizeDays(workoutDays);
  const effectiveDays = days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
  const leads = Array.from(
    new Set(
      leadMinutes
        .map((value) => Math.max(0, Math.min(720, Math.floor(Number(value) || 0))))
        .slice(0, 3)
    )
  );
  const effectiveLeads = leads.length > 0 ? leads : [60];
  const workoutMinuteOfDay =
    Math.min(23, Math.max(0, Math.floor(workoutHour))) * 60 +
    Math.min(59, Math.max(0, Math.floor(workoutMinute)));

  return effectiveLeads.map((lead) => {
    const rawReminderMinute = workoutMinuteOfDay - lead;
    const reminderMinuteOfDay = ((rawReminderMinute % 1_440) + 1_440) % 1_440;
    const dayShift = Math.floor(rawReminderMinute / 1_440);
    return {
      leadMinutes: lead,
      hour: Math.floor(reminderMinuteOfDay / 60),
      minute: reminderMinuteOfDay % 60,
      days: normalizeDays(effectiveDays.map((day) => (day + dayShift + 7) % 7))
    };
  });
}
