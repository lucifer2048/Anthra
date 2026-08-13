import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from "react-native";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Clock3,
  Copy,
  Dumbbell,
  Layers3,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X
} from "lucide-react-native";

import { formatDays, normalizeDays } from "../constants/schedule";
import { clearPlanEditorDraft, getPlanEditorDraft, savePlanEditorDraft } from "../db";
import { useAnthraTheme } from "../design-system";
import {
  estimateWorkoutDurationSeconds,
  formatWorkoutDuration
} from "../features/workout/workoutTimeline";
import type { Exercise, WorkoutPlan, WorkoutPlanInput, WorkoutSection } from "../types";
import { ScreenLayout, useScreenBackgrounds } from "./layout";
import { AnimatedPressable, Button, Card, ChoiceRow, IconButton, KeyboardAwareScrollView, ResponsiveFieldRow, ScreenHeader, SheetDialog, StickyFormFooter, TextField, WeekdayPicker } from "./ui";
import { ExerciseEditorSheet, PlanBasicsSection, PlanScheduleSection, SetEditorSheet, WorkoutSetCard } from "./PlanEditorSections";

type EditableExercise = {
  id?: number;
  localId: string;
  name: string;
  workSecondsText: string;
  restSecondsText: string;
};

type EditableSection = {
  id?: number;
  localId: string;
  name: string;
  loopsText: string;
  restSecondsText: string;
  exercises: EditableExercise[];
};

type PlanEditorDraft = {
  version: 1;
  planId: number | null;
  name: string;
  workoutDays: number[];
  sections: EditableSection[];
};

type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

type PlanEditorModalProps = {
  visible: boolean;
  initialPlan: WorkoutPlan | null;
  defaultWorkoutDays: number[];
  onClose: () => void;
  onSave: (plan: WorkoutPlanInput) => Promise<boolean>;
};

function makeLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultSection(index = 0): EditableSection {
  return {
    localId: makeLocalId(),
    name: `Set ${index + 1}`,
    loopsText: "1",
    restSecondsText: "30",
    exercises: []
  };
}

function toEditableExercise(exercise: Exercise): EditableExercise {
  return {
    id: exercise.id,
    localId: makeLocalId(),
    name: exercise.name,
    workSecondsText: String(exercise.workSeconds),
    restSecondsText: String(exercise.restSeconds)
  };
}

function toEditableSection(section: WorkoutSection, index: number): EditableSection {
  return {
    id: section.id,
    localId: makeLocalId(),
    name: section.name || `Set ${index + 1}`,
    loopsText: String(section.loops),
    restSecondsText: String(section.restSeconds),
    exercises: section.exercises.map(toEditableExercise)
  };
}

function normalizePositiveInt(input: string, fallback: number): number {
  const parsed = Number(input.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeNonNegativeInt(input: string, fallback: number): number {
  const parsed = Number(input.replace(/[^0-9]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.floor(parsed));
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function parseStrictWholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

const MIN_SECTION_LOOPS = 1;
const MAX_SECTION_LOOPS = 20;
const MIN_WORK_SECONDS = 1;
const MAX_WORK_SECONDS = 3600;
const MIN_REST_SECONDS = 0;
const MAX_REST_SECONDS = 600;

type PlanTemplate = {
  name: string;
  exercises: Array<{ name: string; work: number; rest: number }>;
};

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    name: "7-Minute Starter",
    exercises: [
      { name: "Jumping jacks", work: 40, rest: 20 },
      { name: "Bodyweight squats", work: 40, rest: 20 },
      { name: "Push-ups", work: 40, rest: 20 },
      { name: "Mountain climbers", work: 40, rest: 20 },
      { name: "Plank", work: 40, rest: 20 },
      { name: "Reverse lunges", work: 40, rest: 20 },
      { name: "High knees", work: 40, rest: 20 }
    ]
  },
  {
    name: "Quick Mobility",
    exercises: [
      { name: "Arm circles", work: 45, rest: 10 },
      { name: "Hip openers", work: 45, rest: 10 },
      { name: "World's greatest stretch", work: 60, rest: 10 },
      { name: "Cat-cow", work: 45, rest: 10 }
    ]
  },
  {
    name: "Core Express",
    exercises: [
      { name: "Dead bug", work: 40, rest: 20 },
      { name: "Plank", work: 40, rest: 20 },
      { name: "Bicycle crunches", work: 40, rest: 20 },
      { name: "Side plank", work: 40, rest: 20 }
    ]
  }
];

function coerceDraftExercise(candidate: unknown): EditableExercise {
  const source = candidate as Partial<EditableExercise> | null;
  return {
    id: typeof source?.id === "number" ? source.id : undefined,
    localId:
      typeof source?.localId === "string" && source.localId.length > 0 ? source.localId : makeLocalId(),
    name: typeof source?.name === "string" ? source.name : "",
    workSecondsText:
      typeof source?.workSecondsText === "string" && source.workSecondsText.length > 0
        ? source.workSecondsText
        : "40",
    restSecondsText:
      typeof source?.restSecondsText === "string" && source.restSecondsText.length > 0
        ? source.restSecondsText
        : "20"
  };
}

function coerceDraftSection(candidate: unknown, index: number): EditableSection {
  const source = candidate as Partial<EditableSection> | null;
  const rawExercises = Array.isArray(source?.exercises) ? source?.exercises : [];
  const exercises = rawExercises.map(coerceDraftExercise);

  return {
    id: typeof source?.id === "number" ? source.id : undefined,
    localId:
      typeof source?.localId === "string" && source.localId.length > 0 ? source.localId : makeLocalId(),
    name:
      typeof source?.name === "string" && source.name.trim().length > 0
        ? source.name
        : `Set ${index + 1}`,
    loopsText:
      typeof source?.loopsText === "string" && source.loopsText.length > 0 ? source.loopsText : "1",
    restSecondsText:
      typeof source?.restSecondsText === "string" && source.restSecondsText.length > 0
        ? source.restSecondsText
        : "30",
    exercises
  };
}

function toDraftPayload(
  planId: number | null,
  name: string,
  workoutDays: number[],
  sections: EditableSection[]
): PlanEditorDraft {
  return {
    version: 1,
    planId,
    name,
    workoutDays: normalizeDays(workoutDays),
    sections
  };
}

export function PlanEditorModal({
  visible,
  initialPlan,
  defaultWorkoutDays,
  onClose,
  onSave
}: PlanEditorModalProps) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { fontScale, width } = useWindowDimensions();
  const shouldStackControls = width < 360 || fontScale >= 1.35;
  const isEditing = useMemo(() => Boolean(initialPlan), [initialPlan]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [sections, setSections] = useState<EditableSection[]>([defaultSection()]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>("idle");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const [setModalVisible, setSetModalVisible] = useState(false);
  const [setModalMode, setSetModalMode] = useState<"add" | "edit">("add");
  const [editingSetLocalId, setEditingSetLocalId] = useState<string | null>(null);
  const [newSetName, setNewSetName] = useState("");
  const [newSetLoopsText, setNewSetLoopsText] = useState("1");
  const [newSetRestSecondsText, setNewSetRestSecondsText] = useState("30");
  const [exerciseModalVisible, setExerciseModalVisible] = useState(false);
  const [exerciseModalMode, setExerciseModalMode] = useState<"add" | "edit">("add");
  const [editingExerciseSectionLocalId, setEditingExerciseSectionLocalId] = useState<string | null>(null);
  const [editingExerciseLocalId, setEditingExerciseLocalId] = useState<string | null>(null);
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseWorkSecondsText, setNewExerciseWorkSecondsText] = useState("40");
  const [newExerciseRestSecondsText, setNewExerciseRestSecondsText] = useState("20");
  const setNameInputRef = useRef<TextInput>(null);
  const setLoopsInputRef = useRef<TextInput>(null);
  const setRestInputRef = useRef<TextInput>(null);
  const exerciseNameInputRef = useRef<TextInput>(null);
  const exerciseWorkInputRef = useRef<TextInput>(null);
  const exerciseRestInputRef = useRef<TextInput>(null);
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDraftJsonRef = useRef<string | null>(null);
  const pendingDraftRef = useRef(false);
  const mountedRef = useRef(true);
  const closeFlushInFlightRef = useRef(false);

  useEffect(() => {
    if (!setModalVisible) return;
    const focusTimer = setTimeout(() => setNameInputRef.current?.focus(), 220);
    return () => clearTimeout(focusTimer);
  }, [setModalVisible]);

  useEffect(() => {
    if (!exerciseModalVisible) return;
    const focusTimer = setTimeout(() => exerciseNameInputRef.current?.focus(), 220);
    return () => clearTimeout(focusTimer);
  }, [exerciseModalVisible]);

  const activePlanId = initialPlan?.id ?? null;

  const clearPendingDraftTimer = useCallback(() => {
    if (!draftSaveTimeoutRef.current) return;
    clearTimeout(draftSaveTimeoutRef.current);
    draftSaveTimeoutRef.current = null;
  }, []);

  const persistDraftJson = useCallback(async (json: string): Promise<boolean> => {
    if (mountedRef.current && latestDraftJsonRef.current === json) {
      setDraftSaveStatus("saving");
    }

    try {
      await savePlanEditorDraft(json);
      if (latestDraftJsonRef.current === json) {
        pendingDraftRef.current = false;
        if (mountedRef.current) {
          setDraftSaveStatus("saved");
          setDraftSaveError(null);
        }
      }
      return true;
    } catch {
      if (latestDraftJsonRef.current === json) {
        pendingDraftRef.current = true;
        if (mountedRef.current) {
          setDraftSaveStatus("error");
          setDraftSaveError("Your latest changes are still in this editor. Retry before closing to keep them for later.");
        }
      }
      return false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPendingDraftTimer();
      const latestDraft = latestDraftJsonRef.current;
      if (pendingDraftRef.current && latestDraft) {
        void persistDraftJson(latestDraft);
      }
    };
  }, [clearPendingDraftTimer, persistDraftJson]);

  const estimatedDurationSeconds = useMemo(
    () =>
      estimateWorkoutDurationSeconds({
        loops: 1,
        exercises: [],
        sections: sections.map((section, index) => ({
          name: section.name.trim() || `Set ${index + 1}`,
          loops: normalizePositiveInt(section.loopsText, 1),
          restSeconds: normalizeNonNegativeInt(section.restSecondsText, 0),
          exercises: section.exercises.map((exercise) => ({
            name: exercise.name,
            workSeconds: normalizePositiveInt(exercise.workSecondsText, 1),
            restSeconds: normalizeNonNegativeInt(exercise.restSecondsText, 0)
          }))
        }))
      }),
    [sections]
  );

  const estimatedDurationLabel = useMemo(() => {
    if (estimatedDurationSeconds <= 0) return "Add exercises to see duration";
    return `About ${formatWorkoutDuration(estimatedDurationSeconds)}`;
  }, [estimatedDurationSeconds]);

  const resetFromPlan = useCallback(
    (plan: WorkoutPlan | null) => {
      if (plan) {
        setName(plan.name);
        setWorkoutDays(normalizeDays(plan.workoutDays));
        const seedSections =
          plan.sections.length > 0
            ? plan.sections
            : [
                {
                  name: "Main",
                  loops: Math.max(1, plan.loops || 1),
                  restSeconds: 0,
                  exercises: plan.exercises
                }
              ];
        setSections(seedSections.map(toEditableSection));
        return;
      }

      setName("");
      setWorkoutDays(normalizeDays(defaultWorkoutDays));
      setSections([defaultSection(0)]);
    },
    [defaultWorkoutDays]
  );

  useEffect(() => {
    if (!visible) {
      clearPendingDraftTimer();
      const latestDraft = latestDraftJsonRef.current;
      if (pendingDraftRef.current && latestDraft) {
        void persistDraftJson(latestDraft);
      }
      setDraftHydrated(false);
      setSetModalVisible(false);
      setExerciseModalVisible(false);
      return;
    }

    let active = true;
    setDraftHydrated(false);
    setDraftSaveStatus("idle");
    setDraftSaveError(null);

    const hydrate = async () => {
      resetFromPlan(initialPlan);

      const rawDraft = await getPlanEditorDraft();
      if (!rawDraft || !active) {
        setDraftHydrated(true);
        return;
      }

      try {
        const parsed = JSON.parse(rawDraft) as Partial<PlanEditorDraft>;
        if (parsed.version !== 1) {
          setDraftHydrated(true);
          return;
        }

        if ((parsed.planId ?? null) !== activePlanId) {
          setDraftHydrated(true);
          return;
        }

        const draftSections =
          Array.isArray(parsed.sections) && parsed.sections.length > 0
            ? parsed.sections.map((section, index) => coerceDraftSection(section, index))
            : [defaultSection(0)];

        if (!active) return;
        setName(typeof parsed.name === "string" ? parsed.name : "");
        setWorkoutDays(normalizeDays(Array.isArray(parsed.workoutDays) ? parsed.workoutDays : []));
        setSections(draftSections);
      } catch {
        await clearPlanEditorDraft().catch(() => undefined);
      } finally {
        if (active) setDraftHydrated(true);
      }
    };

    hydrate().catch(() => {
      if (active) setDraftHydrated(true);
    });

    return () => {
      active = false;
    };
  }, [activePlanId, clearPendingDraftTimer, initialPlan, persistDraftJson, resetFromPlan, visible]);

  useEffect(() => {
    if (!visible || !draftHydrated) return;
    clearPendingDraftTimer();
    const payload = toDraftPayload(activePlanId, name, workoutDays, sections);
    const json = JSON.stringify(payload);
    latestDraftJsonRef.current = json;
    pendingDraftRef.current = true;
    setDraftSaveStatus("saving");

    const timeout = setTimeout(() => {
      if (draftSaveTimeoutRef.current === timeout) {
        draftSaveTimeoutRef.current = null;
      }
      void persistDraftJson(json);
    }, 350);
    draftSaveTimeoutRef.current = timeout;

    return () => {
      if (draftSaveTimeoutRef.current === timeout) {
        clearTimeout(timeout);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [
    activePlanId,
    clearPendingDraftTimer,
    draftHydrated,
    name,
    persistDraftJson,
    sections,
    visible,
    workoutDays
  ]);

  const toggleWorkoutDay = (day: number) => {
    setWorkoutDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((value) => value !== day);
      }
      return normalizeDays([...prev, day]);
    });
  };

  const openSetModal = (section?: EditableSection, sectionIndex?: number) => {
    if (section) {
      setSetModalMode("edit");
      setEditingSetLocalId(section.localId);
      setNewSetName(section.name);
      setNewSetLoopsText(section.loopsText);
      setNewSetRestSecondsText(section.restSecondsText);
    } else {
      setSetModalMode("add");
      setEditingSetLocalId(null);
      setNewSetName(`Set ${(sectionIndex ?? sections.length) + 1}`);
      setNewSetLoopsText("1");
      setNewSetRestSecondsText("30");
    }
    setSetModalVisible(true);
  };

  const saveSetFromModal = () => {
    const loops = parseStrictWholeNumber(newSetLoopsText);
    if (loops == null || loops < MIN_SECTION_LOOPS || loops > MAX_SECTION_LOOPS) {
      Alert.alert(
        "Invalid loops",
        `Set loops must be a whole number between ${MIN_SECTION_LOOPS} and ${MAX_SECTION_LOOPS}.`
      );
      return;
    }
    const restSeconds = parseStrictWholeNumber(newSetRestSecondsText);
    if (restSeconds == null || restSeconds < MIN_REST_SECONDS || restSeconds > MAX_REST_SECONDS) {
      Alert.alert(
        "Invalid rest",
        `Set rest must be between ${MIN_REST_SECONDS} and ${MAX_REST_SECONDS} seconds.`
      );
      return;
    }

    if (setModalMode === "edit" && editingSetLocalId) {
      setSections((prev) =>
        prev.map((section) =>
          section.localId === editingSetLocalId
            ? {
                ...section,
                name: newSetName.trim() || section.name,
                loopsText: String(loops),
                restSecondsText: String(restSeconds)
              }
            : section
        )
      );
    } else {
      setSections((prev) => [
        ...prev,
        {
          localId: makeLocalId(),
          name: newSetName.trim() || `Set ${prev.length + 1}`,
          loopsText: String(loops),
          restSecondsText: String(restSeconds),
          exercises: []
        }
      ]);
    }
    setSetModalVisible(false);
  };

  const removeSection = (sectionLocalId: string) => {
    setSections((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((section) => section.localId !== sectionLocalId);
    });
  };

  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    setSections((prev) => {
      const targetIndex = sectionIndex + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[sectionIndex], next[targetIndex]] = [next[targetIndex], next[sectionIndex]];
      return next;
    });
  };

  const duplicateSection = (sectionIndex: number) => {
    setSections((prev) => {
      const source = prev[sectionIndex];
      if (!source) return prev;
      const duplicate: EditableSection = {
        ...source,
        id: undefined,
        localId: makeLocalId(),
        name: `${source.name} Copy`,
        exercises: source.exercises.map((exercise) => ({
          ...exercise,
          id: undefined,
          localId: makeLocalId()
        }))
      };
      const next = [...prev];
      next.splice(sectionIndex + 1, 0, duplicate);
      return next;
    });
  };

  const moveExercise = (sectionLocalId: string, exerciseIndex: number, direction: -1 | 1) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.localId !== sectionLocalId) return section;
        const targetIndex = exerciseIndex + direction;
        if (targetIndex < 0 || targetIndex >= section.exercises.length) return section;
        const exercises = [...section.exercises];
        [exercises[exerciseIndex], exercises[targetIndex]] = [exercises[targetIndex], exercises[exerciseIndex]];
        return { ...section, exercises };
      })
    );
  };

  const duplicateExercise = (sectionLocalId: string, exerciseIndex: number) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.localId !== sectionLocalId) return section;
        const source = section.exercises[exerciseIndex];
        if (!source) return section;
        const exercises = [...section.exercises];
        exercises.splice(exerciseIndex + 1, 0, {
          ...source,
          id: undefined,
          localId: makeLocalId(),
          name: `${source.name} Copy`
        });
        return { ...section, exercises };
      })
    );
  };

  const applyTemplate = (template: PlanTemplate) => {
    const apply = () => {
      setName(template.name);
      setSections([
        {
          localId: makeLocalId(),
          name: "Main",
          loopsText: "1",
          restSecondsText: "0",
          exercises: template.exercises.map((exercise) => ({
            localId: makeLocalId(),
            name: exercise.name,
            workSecondsText: String(exercise.work),
            restSecondsText: String(exercise.rest)
          }))
        }
      ]);
    };

    const hasWork = name.trim().length > 0 || sections.some((section) => section.exercises.length > 0);
    if (!hasWork) {
      apply();
      return;
    }
    Alert.alert("Use this starter?", "This replaces the plan currently in the editor.", [
      { text: "Cancel", style: "cancel" },
      { text: "Use Starter", onPress: apply }
    ]);
  };

  const openExerciseModal = (sectionLocalId: string, exercise?: EditableExercise) => {
    if (exercise) {
      setExerciseModalMode("edit");
      setEditingExerciseSectionLocalId(sectionLocalId);
      setEditingExerciseLocalId(exercise.localId);
      setNewExerciseName(exercise.name);
      setNewExerciseWorkSecondsText(exercise.workSecondsText);
      setNewExerciseRestSecondsText(exercise.restSecondsText);
    } else {
      setExerciseModalMode("add");
      setEditingExerciseSectionLocalId(sectionLocalId);
      setEditingExerciseLocalId(null);
      setNewExerciseName("");
      setNewExerciseWorkSecondsText("40");
      setNewExerciseRestSecondsText("20");
    }
    setExerciseModalVisible(true);
  };

  const removeExercise = (sectionLocalId: string, exerciseLocalId: string) => {
    setSections((prev) =>
      prev.map((section) => {
        if (section.localId !== sectionLocalId) return section;
        return {
          ...section,
          exercises: section.exercises.filter((exercise) => exercise.localId !== exerciseLocalId)
        };
      })
    );
  };

  const saveExerciseFromModal = () => {
    if (!editingExerciseSectionLocalId) return;
    if (!newExerciseName.trim()) {
      Alert.alert("Missing name", "Exercise name is required.");
      return;
    }

    const workSeconds = parseStrictWholeNumber(newExerciseWorkSecondsText);
    if (workSeconds == null || workSeconds < MIN_WORK_SECONDS || workSeconds > MAX_WORK_SECONDS) {
      Alert.alert(
        "Invalid work",
        `Work must be a whole number between ${MIN_WORK_SECONDS} and ${MAX_WORK_SECONDS} seconds.`
      );
      return;
    }

    const restSeconds = parseStrictWholeNumber(newExerciseRestSecondsText);
    if (restSeconds == null || restSeconds < MIN_REST_SECONDS || restSeconds > MAX_REST_SECONDS) {
      Alert.alert(
        "Invalid rest",
        `Rest must be between ${MIN_REST_SECONDS} and ${MAX_REST_SECONDS} seconds.`
      );
      return;
    }

    setSections((prev) =>
      prev.map((section) => {
        if (section.localId !== editingExerciseSectionLocalId) return section;

        if (exerciseModalMode === "edit" && editingExerciseLocalId) {
          return {
            ...section,
            exercises: section.exercises.map((exercise) =>
              exercise.localId === editingExerciseLocalId
                ? {
                    ...exercise,
                    name: newExerciseName.trim(),
                    workSecondsText: String(workSeconds),
                    restSecondsText: String(restSeconds)
                  }
                : exercise
            )
          };
        }

        return {
          ...section,
          exercises: [
            ...section.exercises,
            {
              localId: makeLocalId(),
              name: newExerciseName.trim(),
              workSecondsText: String(workSeconds),
              restSecondsText: String(restSeconds)
            }
          ]
        };
      })
    );

    setExerciseModalVisible(false);
  };

  const discardDraft = () => {
    Alert.alert("Discard draft", "Clear unsaved plan draft and reset this editor?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          clearPendingDraftTimer();
          pendingDraftRef.current = false;
          latestDraftJsonRef.current = null;
          await clearPlanEditorDraft().catch(() => undefined);
          resetFromPlan(initialPlan);
          setDraftSaveStatus("idle");
          setDraftSaveError(null);
        }
      }
    ]);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
        const section = sections[sectionIndex];
        if (section.exercises.length === 0) {
          Alert.alert(
            "Set needs an exercise",
            `Set ${sectionIndex + 1} is empty. Add an exercise or delete the set before saving.`
          );
          return;
        }
        const loops = parseStrictWholeNumber(section.loopsText);
        if (loops == null || loops < MIN_SECTION_LOOPS || loops > MAX_SECTION_LOOPS) {
          Alert.alert(
            "Invalid set value",
            `Set ${sectionIndex + 1}: loops must be between ${MIN_SECTION_LOOPS} and ${MAX_SECTION_LOOPS}.`
          );
          return;
        }

        const sectionRest = parseStrictWholeNumber(section.restSecondsText);
        if (
          sectionRest == null ||
          sectionRest < MIN_REST_SECONDS ||
          sectionRest > MAX_REST_SECONDS
        ) {
          Alert.alert(
            "Invalid set value",
            `Set ${sectionIndex + 1}: rest must be between ${MIN_REST_SECONDS} and ${MAX_REST_SECONDS} seconds.`
          );
          return;
        }

        for (let exerciseIndex = 0; exerciseIndex < section.exercises.length; exerciseIndex += 1) {
          const exercise = section.exercises[exerciseIndex];
          if (!exercise.name.trim()) {
            Alert.alert(
              "Exercise needs a name",
              `Set ${sectionIndex + 1}, Exercise ${exerciseIndex + 1} is missing a name.`
            );
            return;
          }

          const workSeconds = parseStrictWholeNumber(exercise.workSecondsText);
          if (
            workSeconds == null ||
            workSeconds < MIN_WORK_SECONDS ||
            workSeconds > MAX_WORK_SECONDS
          ) {
            Alert.alert(
              "Invalid exercise value",
              `Set ${sectionIndex + 1}, Exercise ${exerciseIndex + 1}: work must be between ${MIN_WORK_SECONDS} and ${MAX_WORK_SECONDS} seconds.`
            );
            return;
          }

          const exerciseRest = parseStrictWholeNumber(exercise.restSecondsText);
          if (
            exerciseRest == null ||
            exerciseRest < MIN_REST_SECONDS ||
            exerciseRest > MAX_REST_SECONDS
          ) {
            Alert.alert(
              "Invalid exercise value",
              `Set ${sectionIndex + 1}, Exercise ${exerciseIndex + 1}: rest must be between ${MIN_REST_SECONDS} and ${MAX_REST_SECONDS} seconds.`
            );
            return;
          }
        }
      }

      const payloadSections: WorkoutSection[] = sections
        .map((section, index) => ({
          id: section.id,
          name: section.name.trim() || `Set ${index + 1}`,
          loops: normalizePositiveInt(section.loopsText, 1),
          restSeconds: normalizeNonNegativeInt(section.restSecondsText, 0),
          exercises: section.exercises
            .map((exercise) => ({
              id: exercise.id,
              name: exercise.name.trim(),
              workSeconds: normalizePositiveInt(exercise.workSecondsText, 1),
              restSeconds: normalizeNonNegativeInt(exercise.restSecondsText, 0)
            }))
            .filter((exercise) => exercise.name.length > 0)
        }))
        .filter((section) => section.exercises.length > 0);

      const flatExercises = payloadSections.flatMap((section) => section.exercises);

      const payload: WorkoutPlanInput = {
        id: initialPlan?.id,
        name,
        loops: 1,
        sections: payloadSections,
        exercises: flatExercises,
        workoutDays: normalizeDays(workoutDays)
      };

      const saved = await onSave(payload);
      if (saved) {
        clearPendingDraftTimer();
        pendingDraftRef.current = false;
        latestDraftJsonRef.current = null;
        await clearPlanEditorDraft().catch(() => undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  const flushLatestDraft = useCallback(async (): Promise<boolean> => {
    if (!visible || !draftHydrated) return true;
    clearPendingDraftTimer();
    const json = JSON.stringify(toDraftPayload(activePlanId, name, workoutDays, sections));
    latestDraftJsonRef.current = json;
    pendingDraftRef.current = true;
    return persistDraftJson(json);
  }, [
    activePlanId,
    clearPendingDraftTimer,
    draftHydrated,
    name,
    persistDraftJson,
    sections,
    visible,
    workoutDays
  ]);

  const handleClose = useCallback(async () => {
    if (closeFlushInFlightRef.current) return;
    closeFlushInFlightRef.current = true;
    const flushed = await flushLatestDraft();
    closeFlushInFlightRef.current = false;

    if (flushed) {
      onClose();
      return;
    }

    Alert.alert(
      "Draft not saved",
      "Anthra could not store your latest edits. Keep editing and retry, or close and lose the changes made since the last successful save.",
      [
        { text: "Keep Editing", style: "cancel" },
        { text: "Close Anyway", style: "destructive", onPress: onClose }
      ]
    );
  }, [flushLatestDraft, onClose]);

  const exerciseCount = sections.reduce((sum, section) => sum + section.exercises.length, 0);
  const draftStatusLabel =
    draftSaveStatus === "saving"
      ? "Saving draft…"
      : draftSaveStatus === "saved"
        ? "Draft saved"
        : draftSaveStatus === "error"
          ? "Draft not saved"
          : "Draft ready";

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={handleClose}>
      <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
          style={{ backgroundColor: theme.colors.canvas }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: theme.layout.contentMaxWidth,
              alignSelf: "center",
              paddingHorizontal: theme.layout.screenPadding,
              paddingTop: theme.spacing.sm,
              paddingBottom: theme.spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.divider
            }}
          >
            <ScreenHeader
              eyebrow="WORKOUT PLAN"
              title={isEditing ? "Edit plan" : "Create a plan"}
              subtitle={draftStatusLabel}
              action={
                <View style={{ flexDirection: "row", gap: theme.spacing.xs, flexShrink: 0 }}>
                  <IconButton icon={RotateCcw} onPress={discardDraft} accessibilityLabel="Discard draft" variant="ghost" />
                  <IconButton icon={X} onPress={handleClose} accessibilityLabel="Close plan editor" variant="standard" />
                </View>
              }
            />
          </View>

          <KeyboardAwareScrollView
            className="flex-1"
            contentContainerStyle={{
              width: "100%",
              maxWidth: theme.layout.contentMaxWidth,
              alignSelf: "center",
              paddingHorizontal: theme.layout.screenPadding,
              paddingBottom: theme.spacing["3xl"]
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            showsVerticalScrollIndicator={false}
          >
            {draftSaveError && (
              <Card
                variant="danger"
                treatment="inset"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={{ marginTop: theme.spacing.lg }}
              >
                <Text style={[theme.typography.bodyStrong, { color: theme.colors.danger }]}>Draft not saved</Text>
                <Text style={[theme.typography.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>
                  {draftSaveError}
                </Text>
                <Button
                  label="Retry draft save"
                  onPress={() => {
                    void flushLatestDraft();
                  }}
                  variant="danger"
                  size="small"
                  style={{ marginTop: theme.spacing.md }}
                />
              </Card>
            )}

            <PlanBasicsSection>
            <TextField
              label="Plan name"
              value={name}
              onChangeText={setName}
              placeholder="Upper Body Burn"
              leadingIcon={Dumbbell}
              required
              containerStyle={{ marginTop: theme.spacing.xl }}
            />

            {!isEditing && (
              <Card treatment="inset" style={{ marginTop: theme.spacing.lg }}>
                <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Start from a proven structure</Text>
                <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>Choose a starter, then adjust every interval to fit your training.</Text>
                <View className="mt-3 flex-row flex-wrap" style={{ gap: theme.spacing.sm }}>
                  {PLAN_TEMPLATES.map((template) => (
                    <AnimatedPressable
                      key={template.name}
                      onPress={() => applyTemplate(template)}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${template.name} template`}
                      className="min-h-[44px] justify-center border px-3"
                      style={({ pressed }) => ({
                        borderRadius: theme.radii.full,
                        borderColor: theme.colors.brandBorder,
                        backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.brandSoft
                      })}
                    >
                      <Text style={[theme.typography.label, { color: theme.colors.brand }]}>{template.name}</Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </Card>
            )}
            </PlanBasicsSection>

            <PlanScheduleSection>
            <Card
              variant="brand"
              className="flex-row items-center"
              style={{ marginTop: theme.spacing.lg, gap: theme.spacing.md }}
            >
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 44, height: 44, backgroundColor: theme.colors.surface }}
              >
                <Clock3 accessible={false} color={theme.colors.brand} size={21} />
              </View>
              <View className="min-w-0 flex-1">
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>Estimated duration</Text>
                <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>{estimatedDurationLabel}</Text>
              </View>
              <View className="items-end">
                <Text style={[theme.typography.titleMedium, { color: theme.colors.brand }]}>{exerciseCount}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>exercises</Text>
              </View>
            </Card>

            <Card style={{ marginTop: theme.spacing.lg }}>
              <View className="flex-row items-center" style={{ gap: theme.spacing.sm }}>
                <CalendarDays accessible={false} color={theme.colors.brand} size={20} />
                <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Training days</Text>
              </View>
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
                {formatDays(workoutDays)}. Leave every day off to keep this plan available any day.
              </Text>
              <WeekdayPicker
                value={workoutDays}
                onChange={setWorkoutDays}
                style={{ marginTop: theme.spacing.md }}
              />
            </Card>
            </PlanScheduleSection>

            <View
              className="mt-6"
              style={{
                flexDirection: shouldStackControls ? "column" : "row",
                alignItems: shouldStackControls ? "flex-start" : "flex-end",
                gap: theme.spacing.md
              }}
            >
              <View className="min-w-0 flex-1" style={{ minWidth: 0 }}>
                <Text accessibilityRole="header" style={[theme.typography.titleLarge, { color: theme.colors.textPrimary }]}>Sets</Text>
                <Text numberOfLines={2} style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>They run from top to bottom, including every loop and rest.</Text>
              </View>
              <View className="flex-row items-center" style={{ flexShrink: 0, gap: theme.spacing.sm }}>
                <Layers3 accessible={false} color={theme.colors.brand} size={19} />
                <Text style={[theme.typography.label, { color: theme.colors.brand }]}>{sections.length}</Text>
              </View>
            </View>

            {sections.map((section, sectionIndex) => (
              <WorkoutSetCard
                key={section.localId}
              >
                <Text style={[theme.typography.label, { color: theme.colors.brand }]}>SET {sectionIndex + 1}</Text>
                <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleMedium, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>{section.name}</Text>
                <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
                  {section.loopsText} {section.loopsText === "1" ? "loop" : "loops"} · {section.restSecondsText}s set rest
                </Text>

                <View
                  className="mt-3 border-t pt-2"
                  style={{
                    flexDirection: shouldStackControls ? "column" : "row",
                    alignItems: shouldStackControls ? "stretch" : "center",
                    justifyContent: "space-between",
                    gap: theme.spacing.md,
                    borderColor: theme.colors.divider
                  }}
                >
                  <View className="flex-row" style={{ gap: theme.spacing.xs, flexShrink: 0 }}>
                    <IconButton icon={ArrowUp} onPress={() => moveSection(sectionIndex, -1)} disabled={sectionIndex === 0} accessibilityLabel={`Move ${section.name} up`} variant="ghost" size="small" />
                    <IconButton icon={ArrowDown} onPress={() => moveSection(sectionIndex, 1)} disabled={sectionIndex === sections.length - 1} accessibilityLabel={`Move ${section.name} down`} variant="ghost" size="small" />
                  </View>
                  <View className="flex-row flex-wrap" style={{ gap: theme.spacing.xs, flexShrink: 0 }}>
                    <IconButton icon={Copy} onPress={() => duplicateSection(sectionIndex)} accessibilityLabel={`Duplicate ${section.name}`} variant="ghost" size="small" />
                    <IconButton icon={Pencil} onPress={() => openSetModal(section)} accessibilityLabel={`Edit ${section.name}`} variant="ghost" size="small" />
                    <IconButton icon={Trash2} onPress={() => removeSection(section.localId)} disabled={sections.length <= 1} accessibilityLabel={`Delete ${section.name}`} variant="danger" size="small" />
                  </View>
                </View>

                <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg }]}>Exercises</Text>

                {section.exercises.length === 0 && (
                  <View
                    className="mt-3 border border-dashed px-3 py-4"
                    style={{ borderRadius: theme.radii.md, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceSubtle }}
                  >
                    <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>No exercises yet. Add one to build this set.</Text>
                  </View>
                )}

                {section.exercises.map((exercise, exerciseIndex) => (
                  <Card
                    key={exercise.localId}
                    treatment="inset"
                    padding="small"
                    style={{ marginTop: theme.spacing.md }}
                  >
                    <Text style={[theme.typography.caption, { color: theme.colors.brand }]}>EXERCISE {exerciseIndex + 1}</Text>
                    <Text numberOfLines={2} ellipsizeMode="tail" style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs, minWidth: 0 }]}>{exercise.name || "Unnamed"}</Text>
                    <Text numberOfLines={1} style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>Work {exercise.workSecondsText}s · Rest {exercise.restSecondsText}s</Text>
                    <View
                      className="mt-2"
                      style={{
                        flexDirection: shouldStackControls ? "column" : "row",
                        alignItems: shouldStackControls ? "stretch" : "center",
                        justifyContent: "space-between",
                        gap: theme.spacing.md
                      }}
                    >
                      <View className="flex-row" style={{ gap: theme.spacing.xs, flexShrink: 0 }}>
                        <IconButton icon={ArrowUp} onPress={() => moveExercise(section.localId, exerciseIndex, -1)} disabled={exerciseIndex === 0} accessibilityLabel={`Move ${exercise.name} up`} variant="ghost" size="small" />
                        <IconButton icon={ArrowDown} onPress={() => moveExercise(section.localId, exerciseIndex, 1)} disabled={exerciseIndex === section.exercises.length - 1} accessibilityLabel={`Move ${exercise.name} down`} variant="ghost" size="small" />
                      </View>
                      <View className="flex-row flex-wrap" style={{ gap: theme.spacing.xs, flexShrink: 0 }}>
                        <IconButton icon={Copy} onPress={() => duplicateExercise(section.localId, exerciseIndex)} accessibilityLabel={`Duplicate ${exercise.name}`} variant="ghost" size="small" />
                        <IconButton icon={Pencil} onPress={() => openExerciseModal(section.localId, exercise)} accessibilityLabel={`Edit ${exercise.name}`} variant="ghost" size="small" />
                        <IconButton icon={Trash2} onPress={() => removeExercise(section.localId, exercise.localId)} accessibilityLabel={`Delete ${exercise.name}`} variant="danger" size="small" />
                      </View>
                    </View>
                  </Card>
                ))}

                <View
                  className="mt-4"
                  style={{ flexDirection: shouldStackControls ? "column" : "row", gap: theme.spacing.md }}
                >
                  <Button label="Add exercise" icon={Plus} onPress={() => openExerciseModal(section.localId)} variant="primary" style={{ flex: shouldStackControls ? undefined : 1, alignSelf: "stretch" }} />
                  <Button label="Edit set" icon={Pencil} onPress={() => openSetModal(section)} variant="outline" style={{ flex: shouldStackControls ? undefined : 1, alignSelf: "stretch" }} />
                </View>
              </WorkoutSetCard>
            ))}
          </KeyboardAwareScrollView>

          <StickyFormFooter ownsSafeArea={false} primaryAction={{ label: "Save plan", onPress: save, loading: saving }} secondaryAction={{ label: "Add set", icon: Plus, onPress: () => openSetModal() }} />
        </KeyboardAvoidingView>

        <SetEditorSheet visible={setModalVisible} title={setModalMode === "edit" ? "Edit set" : "Add a set"} subtitle="Define its loop count and the recovery before the next set." onClose={() => setSetModalVisible(false)} actionLabel={setModalMode === "edit" ? "Save set" : "Create set"} onSave={saveSetFromModal}>

              <TextField
                ref={setNameInputRef}
                label="Set name"
                value={newSetName}
                onChangeText={setNewSetName}
                placeholder="Main"
                autoFocus
                selectTextOnFocus
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => setLoopsInputRef.current?.focus()}
                required
                containerStyle={{ marginTop: theme.spacing.lg }}
              />
              <ResponsiveFieldRow style={{ marginTop: theme.spacing.md }}>
                <TextField ref={setLoopsInputRef} label="Loops (1–20)" value={newSetLoopsText} onChangeText={(value) => setNewSetLoopsText(digitsOnly(value))} keyboardType="number-pad" selectTextOnFocus returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => setRestInputRef.current?.focus()} containerStyle={{ flex: shouldStackControls ? undefined : 1 }} />
                <TextField ref={setRestInputRef} label="Rest (0–600s)" value={newSetRestSecondsText} onChangeText={(value) => setNewSetRestSecondsText(digitsOnly(value))} keyboardType="number-pad" selectTextOnFocus returnKeyType="done" onSubmitEditing={saveSetFromModal} containerStyle={{ flex: shouldStackControls ? undefined : 1 }} />
              </ResponsiveFieldRow>

              <ChoiceRow
                label="Quick set rest"
                options={[
                  { label: "None", value: "0" },
                  { label: "15s", value: "15" },
                  { label: "30s", value: "30" },
                  { label: "60s", value: "60" }
                ]}
                value={newSetRestSecondsText}
                onChange={setNewSetRestSecondsText}
                style={{ marginTop: theme.spacing.lg }}
              />

        </SetEditorSheet>

        <ExerciseEditorSheet visible={exerciseModalVisible} title={exerciseModalMode === "edit" ? "Edit exercise" : "Add an exercise"} subtitle="Set the work interval and recovery that follows it." onClose={() => setExerciseModalVisible(false)} actionLabel={exerciseModalMode === "edit" ? "Save exercise" : "Create exercise"} onSave={saveExerciseFromModal}>

              <TextField
                ref={exerciseNameInputRef}
                label="Exercise name"
                value={newExerciseName}
                onChangeText={setNewExerciseName}
                placeholder="Jump squats"
                autoFocus
                selectTextOnFocus
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => exerciseWorkInputRef.current?.focus()}
                required
                containerStyle={{ marginTop: theme.spacing.lg }}
              />
              <ResponsiveFieldRow style={{ marginTop: theme.spacing.md }}>
                <TextField ref={exerciseWorkInputRef} label="Work (1–3600s)" value={newExerciseWorkSecondsText} onChangeText={(value) => setNewExerciseWorkSecondsText(digitsOnly(value))} keyboardType="number-pad" selectTextOnFocus returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => exerciseRestInputRef.current?.focus()} containerStyle={{ flex: shouldStackControls ? undefined : 1 }} />
                <TextField ref={exerciseRestInputRef} label="Rest (0–600s)" value={newExerciseRestSecondsText} onChangeText={(value) => setNewExerciseRestSecondsText(digitsOnly(value))} keyboardType="number-pad" selectTextOnFocus returnKeyType="done" onSubmitEditing={saveExerciseFromModal} containerStyle={{ flex: shouldStackControls ? undefined : 1 }} />
              </ResponsiveFieldRow>

              <ChoiceRow
                label="Quick work / rest"
                options={[
                  { label: "30 / 15", value: "30:15" },
                  { label: "40 / 20", value: "40:20" },
                  { label: "45 / 15", value: "45:15" },
                  { label: "60 / 30", value: "60:30" }
                ]}
                value={`${newExerciseWorkSecondsText}:${newExerciseRestSecondsText}`}
                onChange={(value) => {
                  const [work, rest] = value.split(":");
                  setNewExerciseWorkSecondsText(work);
                  setNewExerciseRestSecondsText(rest);
                }}
                style={{ marginTop: theme.spacing.lg }}
              />

        </ExerciseEditorSheet>
      </ScreenLayout>
    </Modal>
  );
}
