import type { WorkoutPlan, WorkoutPlanInput, WorkoutSection } from "../types";

const PLAN_SHARE_PREFIX = "anthra://plan/import?data=";
const MAX_PLAN_NAME_LENGTH = 120;
const MAX_SECTION_NAME_LENGTH = 120;
const MAX_EXERCISE_NAME_LENGTH = 160;
const MAX_SECTIONS = 50;
const MAX_EXERCISES_PER_SECTION = 100;
const MAX_LOOPS = 100;
const MAX_SECONDS = 24 * 60 * 60;

type SharedPlanPayload = {
  v: 1;
  plan: {
    name: string;
    workoutDays: number[];
    sections: Array<{
      name: string;
      loops: number;
      restSeconds: number;
      exercises: Array<{
        name: string;
        workSeconds: number;
        restSeconds: number;
      }>;
    }>;
  };
};

function createSharedPlanPayload(plan: WorkoutPlan): SharedPlanPayload {
  return {
    v: 1,
    plan: {
      name: plan.name,
      workoutDays: plan.workoutDays,
      sections: plan.sections.map((section) => ({
        name: section.name,
        loops: section.loops,
        restSeconds: section.restSeconds,
        exercises: section.exercises.map((exercise) => ({
          name: exercise.name,
          workSeconds: exercise.workSeconds,
          restSeconds: exercise.restSeconds
        }))
      }))
    }
  };
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const integer = Math.floor(value);
  return integer >= minimum && integer <= maximum ? integer : null;
}

function cleanName(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= maximumLength ? name : null;
}

function parseSection(value: unknown): WorkoutSection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const name = cleanName(raw.name, MAX_SECTION_NAME_LENGTH);
  const loops = boundedInteger(raw.loops, 1, MAX_LOOPS);
  const restSeconds = boundedInteger(raw.restSeconds, 0, MAX_SECONDS);
  if (!name || loops === null || restSeconds === null || !Array.isArray(raw.exercises)) return null;
  if (raw.exercises.length === 0 || raw.exercises.length > MAX_EXERCISES_PER_SECTION) return null;

  const exercises = raw.exercises.map((exercise) => {
    if (!exercise || typeof exercise !== "object") return null;
    const item = exercise as Record<string, unknown>;
    const exerciseName = cleanName(item.name, MAX_EXERCISE_NAME_LENGTH);
    const workSeconds = boundedInteger(item.workSeconds, 1, MAX_SECONDS);
    const exerciseRestSeconds = boundedInteger(item.restSeconds, 0, MAX_SECONDS);
    if (!exerciseName || workSeconds === null || exerciseRestSeconds === null) return null;
    return { name: exerciseName, workSeconds, restSeconds: exerciseRestSeconds };
  });

  if (exercises.some((exercise) => exercise === null)) return null;
  return {
    name,
    loops,
    restSeconds,
    exercises: exercises as WorkoutSection["exercises"]
  };
}

export function createPlanShareUrl(plan: WorkoutPlan): string {
  return `${PLAN_SHARE_PREFIX}${encodeURIComponent(JSON.stringify(createSharedPlanPayload(plan)))}`;
}

export function createPlanShareFileContents(plan: WorkoutPlan): string {
  return JSON.stringify(createSharedPlanPayload(plan), null, 2);
}

export function isPlanShareUrl(url: string): boolean {
  return url.startsWith(PLAN_SHARE_PREFIX);
}

function parseSharedPlanPayload(payload: unknown): WorkoutPlanInput | null {
  try {
    if (!payload || typeof payload !== "object") return null;
    const rawPayload = payload as Record<string, unknown>;
    if (rawPayload.v !== 1 || !rawPayload.plan || typeof rawPayload.plan !== "object") return null;

    const rawPlan = rawPayload.plan as Record<string, unknown>;
    const name = cleanName(rawPlan.name, MAX_PLAN_NAME_LENGTH);
    if (!name || !Array.isArray(rawPlan.sections)) return null;
    if (rawPlan.sections.length === 0 || rawPlan.sections.length > MAX_SECTIONS) return null;

    const sections = rawPlan.sections.map(parseSection);
    if (sections.some((section) => section === null)) return null;

    const workoutDays = Array.isArray(rawPlan.workoutDays)
      ? Array.from(
          new Set(
            rawPlan.workoutDays.filter(
              (day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6
            )
          )
        ).sort((left, right) => left - right)
      : [];
    const validSections = sections as WorkoutSection[];

    return {
      name,
      loops: 1,
      sections: validSections,
      exercises: validSections.flatMap((section) => section.exercises),
      workoutDays
    };
  } catch {
    return null;
  }
}

export function parsePlanShareUrl(url: string): WorkoutPlanInput | null {
  if (!isPlanShareUrl(url)) return null;

  try {
    const encodedPayload = url.slice(PLAN_SHARE_PREFIX.length).split("#", 1)[0];
    return parseSharedPlanPayload(JSON.parse(decodeURIComponent(encodedPayload)));
  } catch {
    return null;
  }
}

export function parsePlanShareText(value: string): WorkoutPlanInput | null {
  const text = value.trim();
  if (!text) return null;

  const linkIndex = text.indexOf(PLAN_SHARE_PREFIX);
  if (linkIndex >= 0) {
    const url = text.slice(linkIndex).split(/\s/, 1)[0];
    return parsePlanShareUrl(url);
  }

  try {
    return parseSharedPlanPayload(JSON.parse(text));
  } catch {
    return null;
  }
}

export function createPlanShareMessage(plan: WorkoutPlan): string {
  return [
    `I shared “${plan.name}” with you from Anthra.`,
    "Open this link to add it to your plans:",
    createPlanShareUrl(plan),
    "",
    "If the link is not tappable, copy this message and use Plans → Import → Paste shared link in Anthra."
  ].join("\n");
}
