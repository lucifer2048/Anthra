import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { Pencil, Trash2 } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WEEKDAY_OPTIONS, formatDays, normalizeDays } from "../constants/schedule";
import { clearPlanEditorDraft, getPlanEditorDraft, savePlanEditorDraft } from "../db";
import type { Exercise, WorkoutPlan, WorkoutPlanInput, WorkoutSection } from "../types";

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
  const isEditing = useMemo(() => Boolean(initialPlan), [initialPlan]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [sections, setSections] = useState<EditableSection[]>([defaultSection()]);
  const [draftHydrated, setDraftHydrated] = useState(false);
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
  const editIconColor = "#05AED5";
  const deleteIconColor = "#FF6E7F";

  const activePlanId = initialPlan?.id ?? null;

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
      setDraftHydrated(false);
      setSetModalVisible(false);
      setExerciseModalVisible(false);
      return;
    }

    let active = true;
    setDraftHydrated(false);

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
  }, [activePlanId, initialPlan, resetFromPlan, visible]);

  useEffect(() => {
    if (!visible || !draftHydrated) return;
    const timeout = setTimeout(() => {
      const payload = toDraftPayload(activePlanId, name, workoutDays, sections);
      savePlanEditorDraft(JSON.stringify(payload)).catch(() => undefined);
    }, 350);

    return () => clearTimeout(timeout);
  }, [activePlanId, draftHydrated, name, sections, visible, workoutDays]);

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
          await clearPlanEditorDraft().catch(() => undefined);
          resetFromPlan(initialPlan);
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
          if (!exercise.name.trim()) continue;

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
        await clearPlanEditorDraft().catch(() => undefined);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-ink dark:bg-[#050505]" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 bg-ink dark:bg-[#050505]"
        >
          <View className="flex-row items-center justify-between px-6 pb-4 pt-4">
            <Text className="text-2xl font-bold text-[#08364A] dark:text-white">{isEditing ? "Edit Plan" : "New Plan"}</Text>
            <View className="flex-row items-center gap-4">
              <Pressable onPress={discardDraft}>
                <Text className="text-sm font-semibold text-[#4A8FA2] dark:text-white/60">Discard Draft</Text>
              </Pressable>
              <Pressable onPress={onClose}>
                <Text className="text-base font-semibold text-[#34768B] dark:text-white/70">Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <Text className="mb-2 mt-2 text-sm font-semibold text-[#34768B] dark:text-white/70">Plan Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Upper Body Burn"
              placeholderTextColor="#7A7A7A"
              className="rounded-2xl border border-[#05AED5]/22 dark:border-white/10 bg-panel dark:bg-[#151515] px-4 py-4 text-lg font-semibold text-[#08364A] dark:text-white"
            />

            <View className="mt-6 rounded-2xl border border-[#05AED5]/22 dark:border-white/10 bg-panel dark:bg-[#151515] p-4">
              <Text className="text-sm font-semibold uppercase tracking-[2px] text-[#4A8FA2] dark:text-white/60">Workout Days</Text>
              <Text className="mt-2 text-sm text-[#34768B] dark:text-white/70">
                {formatDays(workoutDays)}. Leave all days off to allow this plan any day.
              </Text>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const active = workoutDays.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      onPress={() => toggleWorkoutDay(day.value)}
                      className={`rounded-full border px-3 py-2 ${
                        active ? "border-neon-blue bg-neon-blue/25" : "border-[#05AED5]/35 dark:border-white/20 bg-ink dark:bg-[#050505]"
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold uppercase ${
                          active ? "text-neon-blue" : "text-[#2A6A80] dark:text-white/75"
                        }`}
                      >
                        {day.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <Text className="mt-6 text-xl font-bold text-[#08364A] dark:text-white">Sets</Text>
            <Text className="mt-1 text-sm text-[#34768B] dark:text-white/70">
              Example: Warm Up, Main, Finisher. Each set runs in order.
            </Text>

            {sections.map((section, sectionIndex) => (
              <View key={section.localId} className="mt-4 rounded-2xl border border-[#05AED5]/22 dark:border-white/10 bg-panel dark:bg-[#151515] p-4">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-base font-semibold text-[#08364A] dark:text-white">Set #{sectionIndex + 1}</Text>
                    <Text className="mt-1 text-lg font-black text-[#08364A] dark:text-white">{section.name}</Text>
                    <Text className="mt-1 text-sm text-[#2A6A80] dark:text-white/75">
                      {section.loopsText} loop(s) • {section.restSecondsText}s set rest
                    </Text>
                  </View>
                  <View className="items-end gap-1">
                    <Pressable onPress={() => openSetModal(section)} className="h-9 w-9 items-center justify-center">
                      <Pencil size={16} color={editIconColor} />
                    </Pressable>
                    <Pressable onPress={() => removeSection(section.localId)} className="h-9 w-9 items-center justify-center">
                      <Trash2 size={16} color={deleteIconColor} />
                    </Pressable>
                  </View>
                </View>

                <Text className="mt-4 text-sm font-semibold text-[#2A6A80] dark:text-white/75">Exercises</Text>

                {section.exercises.length === 0 && (
                  <View className="mt-3 rounded-xl border border-dashed border-[#05AED5]/28 dark:border-white/15 bg-ink dark:bg-[#050505] px-3 py-4">
                    <Text className="text-sm text-[#34768B] dark:text-white/70">
                      No exercises yet. Add one to build this set.
                    </Text>
                  </View>
                )}

                {section.exercises.map((exercise, exerciseIndex) => (
                  <View key={exercise.localId} className="mt-3 rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] p-3">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-3">
                        <Text className="text-sm font-semibold text-[#1E5B71] dark:text-white/80">#{exerciseIndex + 1}</Text>
                        <Text className="mt-1 text-base font-black text-[#08364A] dark:text-white">{exercise.name || "Unnamed"}</Text>
                        <Text className="mt-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#34768B] dark:text-white/70">
                          Work {exercise.workSecondsText}s • Rest {exercise.restSecondsText}s
                        </Text>
                      </View>
                      <View className="items-end gap-1">
                        <Pressable
                          onPress={() => openExerciseModal(section.localId, exercise)}
                          className="h-9 w-9 items-center justify-center"
                        >
                          <Pencil size={16} color={editIconColor} />
                        </Pressable>
                        <Pressable
                          onPress={() => removeExercise(section.localId, exercise.localId)}
                          className="h-9 w-9 items-center justify-center"
                        >
                          <Trash2 size={16} color={deleteIconColor} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}

                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    onPress={() => openExerciseModal(section.localId)}
                    className="flex-1 items-center rounded-xl bg-neon-blue px-4 py-3"
                  >
                    <Text className="font-bold text-ink">Add Exercise</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openSetModal(section)}
                    className="flex-1 items-center rounded-xl border border-neon-blue/40 bg-neon-blue/15 px-4 py-3"
                  >
                    <Text className="font-bold text-neon-blue">Edit Set</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          <View className="border-t border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-6 pb-4 pt-3">
            <View className="flex-row gap-3">
              <Pressable onPress={() => openSetModal()} className="flex-1 items-center rounded-2xl bg-neon-blue py-4">
                <Text className="text-base font-black text-ink">Add Set</Text>
              </Pressable>
              <Pressable
                onPress={save}
                className="flex-1 items-center rounded-2xl bg-neon-green py-4"
                disabled={saving}
              >
                <Text className="text-base font-black text-ink">{saving ? "Saving..." : "Save Plan"}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Modal
          visible={setModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSetModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/70 px-5"
          >
            <View className="rounded-3xl border border-[#05AED5]/22 dark:border-white/10 bg-panel dark:bg-[#151515] p-5">
              <Text className="text-xl font-black text-[#08364A] dark:text-white">
                {setModalMode === "edit" ? "Edit Set" : "Add Set"}
              </Text>
              <Text className="mt-1 text-sm text-[#34768B] dark:text-white/70">
                Add the set details in a focused popup so typing stays visible above the keyboard.
              </Text>

              <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                Set Name
              </Text>
              <TextInput
                value={newSetName}
                onChangeText={setNewSetName}
                placeholder="Main"
                placeholderTextColor="#7A7A7A"
                className="rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-3 py-3 text-base font-medium text-[#08364A] dark:text-white"
              />

              <View className="mt-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                    Loops (1-20)
                  </Text>
                  <TextInput
                    value={newSetLoopsText}
                    onChangeText={(value) => setNewSetLoopsText(digitsOnly(value))}
                    keyboardType="number-pad"
                    className="rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-3 py-3 text-base font-medium text-[#08364A] dark:text-white"
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                    Rest (0-600)
                  </Text>
                  <TextInput
                    value={newSetRestSecondsText}
                    onChangeText={(value) => setNewSetRestSecondsText(digitsOnly(value))}
                    keyboardType="number-pad"
                    className="rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-3 py-3 text-base font-medium text-[#08364A] dark:text-white"
                  />
                </View>
              </View>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setSetModalVisible(false)}
                  className="flex-1 items-center rounded-xl border border-[#05AED5]/35 dark:border-white/20 bg-ink dark:bg-[#050505] py-3"
                >
                  <Text className="font-semibold text-[#1E5B71] dark:text-white/80">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveSetFromModal}
                  className="flex-1 items-center rounded-xl bg-neon-green py-3"
                >
                  <Text className="font-black text-ink">
                    {setModalMode === "edit" ? "Save Set" : "Create Set"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        <Modal
          visible={exerciseModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setExerciseModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center bg-black/70 px-5"
          >
            <View className="rounded-3xl border border-[#05AED5]/22 dark:border-white/10 bg-panel dark:bg-[#151515] p-5">
              <Text className="text-xl font-black text-[#08364A] dark:text-white">
                {exerciseModalMode === "edit" ? "Edit Exercise" : "Add Exercise"}
              </Text>
              <Text className="mt-1 text-sm text-[#34768B] dark:text-white/70">
                Keep exercise edits in this popup so the keyboard never hides your fields.
              </Text>

              <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                Exercise Name
              </Text>
              <TextInput
                value={newExerciseName}
                onChangeText={setNewExerciseName}
                placeholder="Jump Squats"
                placeholderTextColor="#7A7A7A"
                className="rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-3 py-3 text-base font-medium text-[#08364A] dark:text-white"
              />

              <View className="mt-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                    Work (1-3600)
                  </Text>
                  <TextInput
                    value={newExerciseWorkSecondsText}
                    onChangeText={(value) => setNewExerciseWorkSecondsText(digitsOnly(value))}
                    keyboardType="number-pad"
                    className="rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-3 py-3 text-base font-medium text-[#08364A] dark:text-white"
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-xs font-semibold uppercase tracking-[1.2px] text-[#4A8FA2] dark:text-white/60">
                    Rest (0-600)
                  </Text>
                  <TextInput
                    value={newExerciseRestSecondsText}
                    onChangeText={(value) => setNewExerciseRestSecondsText(digitsOnly(value))}
                    keyboardType="number-pad"
                    className="rounded-xl border border-[#05AED5]/22 dark:border-white/10 bg-ink dark:bg-[#050505] px-3 py-3 text-base font-medium text-[#08364A] dark:text-white"
                  />
                </View>
              </View>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={() => setExerciseModalVisible(false)}
                  className="flex-1 items-center rounded-xl border border-[#05AED5]/35 dark:border-white/20 bg-ink dark:bg-[#050505] py-3"
                >
                  <Text className="font-semibold text-[#1E5B71] dark:text-white/80">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={saveExerciseFromModal}
                  className="flex-1 items-center rounded-xl bg-neon-green py-3"
                >
                  <Text className="font-black text-ink">
                    {exerciseModalMode === "edit" ? "Save Exercise" : "Create Exercise"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}
