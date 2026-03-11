import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import { SafeAreaView } from "react-native-safe-area-context";

import type { TimerPhase, WorkoutPlan, WorkoutRunSummary, WorkoutSection } from "../types";
import { useAudioCues } from "../hooks/useAudioCues";

type Segment = {
  kind: "work" | "rest";
  seconds: number;
  exerciseName: string;
  setName: string;
  setIndex: number;
  setCount: number;
  loopIndex: number;
  loopCount: number;
};

type TimerScreenProps = {
  plan: WorkoutPlan;
  onBack: (summary: WorkoutRunSummary) => Promise<void> | void;
  onComplete: (summary: WorkoutRunSummary) => Promise<void>;
  isDarkMode?: boolean;
  accentColor?: string;
  accentSoftColor?: string;
  accentTextColor?: string;
};

function normalizeSections(plan: WorkoutPlan): WorkoutSection[] {
  if (plan.sections.length > 0) {
    return plan.sections.filter((section) => section.exercises.length > 0);
  }
  return [
    {
      name: "Main",
      loops: Math.max(1, plan.loops),
      restSeconds: 0,
      exercises: plan.exercises
    }
  ].filter((section) => section.exercises.length > 0);
}

function buildSegments(plan: WorkoutPlan): Segment[] {
  const sections = normalizeSections(plan);
  const segments: Segment[] = [];

  sections.forEach((section, sectionIndex) => {
    const safeLoops = Math.max(1, section.loops);
    const lastExerciseIndex = section.exercises.length - 1;

    for (let loopIndex = 0; loopIndex < safeLoops; loopIndex += 1) {
      section.exercises.forEach((exercise, exerciseIndex) => {
        segments.push({
          kind: "work",
          seconds: Math.max(1, exercise.workSeconds),
          exerciseName: exercise.name,
          setName: section.name,
          setIndex: sectionIndex,
          setCount: sections.length,
          loopIndex,
          loopCount: safeLoops
        });

        const isLastExerciseInLoop = exerciseIndex === lastExerciseIndex;
        if (exercise.restSeconds > 0 && !isLastExerciseInLoop) {
          segments.push({
            kind: "rest",
            seconds: Math.max(1, exercise.restSeconds),
            exerciseName: exercise.name,
            setName: section.name,
            setIndex: sectionIndex,
            setCount: sections.length,
            loopIndex,
            loopCount: safeLoops
          });
        }

        const isLastLoopInSet = loopIndex === safeLoops - 1;
        const isLastSet = sectionIndex === sections.length - 1;
        if (isLastExerciseInLoop && section.restSeconds > 0 && !(isLastLoopInSet && isLastSet)) {
          segments.push({
            kind: "rest",
            seconds: Math.max(1, section.restSeconds),
            exerciseName: `${section.name} reset`,
            setName: section.name,
            setIndex: sectionIndex,
            setCount: sections.length,
            loopIndex,
            loopCount: safeLoops
          });
        }
      });
    }
  });

  return segments;
}

function phaseStyle(phase: TimerPhase, isDarkMode: boolean, accentColor: string) {
  const restAccent = isDarkMode ? "#EAB980" : "#B37B3A";

  if (isDarkMode) {
    if (phase === "work") {
      return {
        backgroundColor: "#060606",
        accentColor,
        mutedColor: "#9AD7EA"
      };
    }
    if (phase === "rest") {
      return {
        backgroundColor: "#0D0D0D",
        accentColor: restAccent,
        mutedColor: "#9AD7EA"
      };
    }
    if (phase === "complete") {
      return {
        backgroundColor: "#080808",
        accentColor,
        mutedColor: "#B5E8F3"
      };
    }
    return {
      backgroundColor: "#050505",
      accentColor,
      mutedColor: "#9AD7EA"
    };
  }

  if (phase === "work") {
    return {
      backgroundColor: "#F2FCFF",
      accentColor,
      mutedColor: "#3F8196"
    };
  }
  if (phase === "rest") {
    return {
      backgroundColor: "#F7FDFF",
      accentColor: restAccent,
      mutedColor: "#3F8196"
    };
  }
  if (phase === "complete") {
    return {
      backgroundColor: "#EEF9FF",
      accentColor,
      mutedColor: "#3F8196"
    };
  }
  return {
    backgroundColor: "#F4FCFF",
    accentColor,
    mutedColor: "#3F8196"
  };
}

export function TimerScreen({
  plan,
  onBack,
  onComplete,
  isDarkMode = false,
  accentColor = "#05AED5",
  accentSoftColor,
  accentTextColor = "#08202A"
}: TimerScreenProps) {
  useKeepAwake();
  const { height, width } = useWindowDimensions();
  const segments = useMemo(() => buildSegments(plan), [plan]);
  const [phase, setPhase] = useState<TimerPhase>("ready");
  const [remaining, setRemaining] = useState(5);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const startedAtRef = useRef(Date.now());
  const completionHandled = useRef(false);
  const backHandled = useRef(false);
  const { playShort, playLong } = useAudioCues();

  const activeSegment = segments[segmentIndex] ?? null;
  const currentSegment = phase === "ready" ? segments[0] ?? null : activeSegment;
  const styles = phaseStyle(phase, isDarkMode, accentColor);
  const textPrimaryColor = isDarkMode ? "#FFFFFF" : "#08364A";
  const textMutedColor = isDarkMode ? "rgba(255,255,255,0.82)" : "#3F8196";
  const accentSurface = accentSoftColor ?? (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(5,174,213,0.12)");
  const timerValue = phase === "complete" ? "0" : String(remaining);
  const timerFontSize = useMemo(() => {
    const lengthScale = timerValue.length <= 2 ? 1 : timerValue.length === 3 ? 0.8 : 0.68;
    const nextSize = Math.min(width * 0.58, height * 0.24) * lengthScale;
    return Math.max(120, Math.min(220, nextSize));
  }, [height, timerValue.length, width]);
  const isWideMetaLayout = width >= 390;

  const triggerCountdownCue = useCallback(() => {
    playShort();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [playShort]);

  const triggerTransitionCue = useCallback(() => {
    playLong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [playLong]);

  const getRunSummary = useCallback(
    (forceCompleted = false): WorkoutRunSummary => {
      const totalSegments = segments.length;
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));

      if (forceCompleted || phase === "complete") {
        return {
          completed: true,
          progressPercent: 100,
          completedSegments: totalSegments,
          totalSegments,
          elapsedSeconds
        };
      }

      if (phase === "ready" || totalSegments === 0) {
        return {
          completed: false,
          progressPercent: 0,
          completedSegments: 0,
          totalSegments,
          elapsedSeconds
        };
      }

      const baseCompleted = Math.max(0, Math.min(segmentIndex, totalSegments));
      const activeSeconds = activeSegment?.seconds ?? 1;
      const consumed = Math.max(0, Math.min(activeSeconds, activeSeconds - remaining));
      const segmentProgress = activeSeconds > 0 ? consumed / activeSeconds : 0;
      const progressPercent = ((baseCompleted + segmentProgress) / totalSegments) * 100;

      return {
        completed: false,
        progressPercent: Math.max(0, Math.min(100, progressPercent)),
        completedSegments: baseCompleted,
        totalSegments,
        elapsedSeconds
      };
    },
    [activeSegment?.seconds, phase, remaining, segmentIndex, segments.length]
  );

  const advancePhase = useCallback(() => {
    if (phase === "ready") {
      if (segments.length === 0) {
        setPhase("complete");
        setIsRunning(false);
        return;
      }
      setPhase(segments[0].kind);
      setSegmentIndex(0);
      setRemaining(segments[0].seconds);
      return;
    }

    const nextIndex = segmentIndex + 1;
    if (nextIndex >= segments.length) {
      setPhase("complete");
      setIsRunning(false);
      return;
    }

    setSegmentIndex(nextIndex);
    setPhase(segments[nextIndex].kind);
    setRemaining(segments[nextIndex].seconds);
  }, [phase, segmentIndex, segments]);

  useEffect(() => {
    if (!isRunning || phase === "complete") return;
    const interval = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, phase]);

  useEffect(() => {
    if (!isRunning || phase === "complete") return;

    if (remaining > 0 && remaining <= 3) {
      triggerCountdownCue();
      return;
    }

    if (remaining === 0) {
      triggerTransitionCue();
      advancePhase();
    }
  }, [advancePhase, isRunning, phase, remaining, triggerCountdownCue, triggerTransitionCue]);

  useEffect(() => {
    if (phase !== "complete" || completionHandled.current) return;
    completionHandled.current = true;
    onComplete(getRunSummary(true)).catch(() => undefined);
  }, [getRunSummary, onComplete, phase]);

  const phaseLabel = useMemo(() => {
    if (phase === "ready") return "READY";
    if (phase === "work") return "WORK";
    if (phase === "rest") return "REST";
    return "WORKOUT COMPLETE";
  }, [phase]);

  const title = useMemo(() => {
    if (phase === "ready") return plan.name;
    if (phase === "complete") return "Great session.";
    return activeSegment?.exerciseName ?? "Exercise";
  }, [activeSegment?.exerciseName, phase, plan.name]);

  const upcomingWorkSegment = useMemo(() => {
    if (phase === "complete") return null;
    const startIndex = phase === "ready" ? 0 : segmentIndex + 1;
    for (let index = startIndex; index < segments.length; index += 1) {
      if (segments[index].kind === "work") {
        return segments[index];
      }
    }
    return null;
  }, [phase, segmentIndex, segments]);

  const progressPercent = useMemo(() => {
    if (segments.length === 0) return 0;
    if (phase === "ready") return 0;
    if (phase === "complete") return 100;

    const activeSeconds = activeSegment?.seconds ?? 1;
    const consumed = Math.max(0, Math.min(activeSeconds, activeSeconds - remaining));
    const completed = Math.max(0, Math.min(segmentIndex, segments.length));
    return Math.max(0, Math.min(100, ((completed + consumed / activeSeconds) / segments.length) * 100));
  }, [activeSegment?.seconds, phase, remaining, segmentIndex, segments.length]);

  const skipCurrentSegment = useCallback(() => {
    if (phase !== "work" && phase !== "rest") return;
    triggerTransitionCue();
    advancePhase();
  }, [advancePhase, phase, triggerTransitionCue]);

  const handleBack = useCallback(() => {
    if (backHandled.current) return;
    backHandled.current = true;
    setIsRunning(false);
    const summary = getRunSummary(phase === "complete");
    Promise.resolve(onBack(summary)).catch(() => undefined);
  }, [getRunSummary, onBack, phase]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: styles.backgroundColor }} edges={["top", "bottom"]}>
      <View className="flex-1 px-6 pb-8 pt-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-xs font-bold uppercase tracking-[2px]" style={{ color: styles.accentColor }}>
              {phaseLabel}
            </Text>
            <Text className="mt-1 text-base font-black" style={{ color: textPrimaryColor }}>
              {plan.name}
            </Text>
          </View>
          <Pressable
            onPress={handleBack}
            className={`rounded-xl border px-4 py-2 ${
              isDarkMode ? "bg-white/10" : "bg-white"
            }`}
            style={{ borderColor: isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(5,174,213,0.28)" }}
          >
            <Text className="text-sm font-bold" style={{ color: textPrimaryColor }}>
              Exit
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 flex-row items-center gap-3">
          <View className={`flex-1 h-2 rounded-full ${isDarkMode ? "bg-white/20" : "bg-[#D6EDF5]"}`}>
            <View
              className="h-2 rounded-full"
              style={{ width: `${progressPercent}%`, backgroundColor: styles.accentColor }}
            />
          </View>
          <Text className="text-sm font-black" style={{ color: styles.accentColor }}>
            {Math.round(progressPercent)}%
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          <View
            className="mt-4 rounded-full px-4 py-2"
            style={{ backgroundColor: accentSurface }}
          >
            <Text className="text-sm font-black uppercase tracking-[2px]" style={{ color: styles.accentColor }}>
              {phaseLabel}
            </Text>
          </View>

          <Text className="px-3 text-center text-3xl font-black" style={{ color: textPrimaryColor }}>
            {title}
          </Text>

          {phase !== "complete" && currentSegment && (
            <Text className="mt-2 text-center text-sm font-semibold" style={{ color: textMutedColor }}>
              {currentSegment.setName} • {currentSegment.loopIndex + 1}/{currentSegment.loopCount}
            </Text>
          )}

          <View
            className="mt-4 min-h-[180px] w-full items-center justify-center"
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}
              style={{ color: styles.accentColor, fontSize: timerFontSize, lineHeight: timerFontSize, fontWeight: "900" }}
            >
              {timerValue}
            </Text>
          </View>
        </View>

        {phase !== "complete" && (
          <View
            className="mt-4 gap-3"
            style={{ flexDirection: isWideMetaLayout ? "row" : "column" }}
          >
            <View
              className="rounded-2xl border p-4"
              style={{
                flex: 1,
                borderColor: styles.accentColor,
                backgroundColor: accentSurface
              }}
            >
              <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: styles.accentColor }}>
                Current
              </Text>
              <Text className="mt-2 text-lg font-black" style={{ color: textPrimaryColor }}>
                {phase === "ready" ? currentSegment?.exerciseName ?? "No exercise" : title}
              </Text>
              <Text className="mt-1 text-xs font-black uppercase tracking-[1.4px]" style={{ color: styles.accentColor }}>
                {phase === "ready" ? "Starts with work" : phaseLabel}
              </Text>
            </View>

            <View
              className="rounded-2xl border p-4"
              style={{
                flex: 1,
                borderColor: isDarkMode ? "rgba(255,255,255,0.15)" : "rgba(5,174,213,0.22)",
                backgroundColor: isDarkMode ? "rgba(255,255,255,0.04)" : "#F7FCFE"
              }}
            >
              <Text className="text-xs font-semibold uppercase tracking-[2px]" style={{ color: textMutedColor }}>
                Up Next
              </Text>
              <Text className="mt-2 text-lg font-black" style={{ color: textPrimaryColor }}>
                {upcomingWorkSegment?.exerciseName ?? "Finish"}
              </Text>
              {upcomingWorkSegment && (
                <Text className="mt-1 text-xs font-semibold" style={{ color: textMutedColor }}>
                  {upcomingWorkSegment.setName} • {upcomingWorkSegment.loopIndex + 1}/{upcomingWorkSegment.loopCount}
                </Text>
              )}
            </View>
          </View>
        )}

        {phase !== "complete" && (
          <View className="mt-4 flex-row gap-3">
            <Pressable
              onPress={() => setIsRunning((current) => !current)}
              className={`flex-1 items-center rounded-2xl py-4 ${
                isDarkMode ? "bg-white/15" : "border border-[#05AED5]/28 bg-white"
              }`}
            >
              <Text className="text-lg font-bold" style={{ color: textPrimaryColor }}>
                {isRunning ? "Pause" : "Resume"}
              </Text>
            </Pressable>
            {(phase === "work" || phase === "rest") && (
              <Pressable
                onPress={skipCurrentSegment}
                className={`flex-1 items-center rounded-2xl py-4 ${
                  phase === "rest" ? "" : "bg-neon-amber/30"
                }`}
                style={phase === "rest" ? { backgroundColor: accentSurface } : undefined}
              >
                <Text
                  className={`text-base font-black ${
                    phase === "rest" ? "" : "text-neon-amber"
                  }`}
                  style={phase === "rest" ? { color: accentColor } : undefined}
                >
                  {phase === "rest" ? "Skip Rest" : "Skip Exercise"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {phase === "complete" && (
          <Pressable onPress={handleBack} className="mt-4 items-center rounded-2xl py-4" style={{ backgroundColor: accentColor }}>
            <Text className="text-lg font-black" style={{ color: accentTextColor }}>Back to Dashboard</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
