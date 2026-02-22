import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
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

function phaseStyle(phase: TimerPhase) {
  if (phase === "work") {
    return {
      backgroundColor: "#061B0E",
      accentColor: "#67FF8A"
    };
  }
  if (phase === "rest") {
    return {
      backgroundColor: "#2B1A06",
      accentColor: "#FFB547"
    };
  }
  if (phase === "complete") {
    return {
      backgroundColor: "#071C2D",
      accentColor: "#52B7FF"
    };
  }
  return {
    backgroundColor: "#111111",
    accentColor: "#FFFFFF"
  };
}

export function TimerScreen({ plan, onBack, onComplete }: TimerScreenProps) {
  useKeepAwake();
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
  const styles = phaseStyle(phase);

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
    if (phase !== "rest") return null;
    for (let index = segmentIndex + 1; index < segments.length; index += 1) {
      if (segments[index].kind === "work") {
        return segments[index];
      }
    }
    return null;
  }, [phase, segmentIndex, segments]);

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
          <Text className="text-base font-semibold text-white/70">{plan.name}</Text>
          <Pressable onPress={handleBack}>
            <Text className="text-base font-semibold text-white/80">Exit</Text>
          </Pressable>
        </View>

        <Text
          className="mt-8 text-center text-2xl font-black tracking-[6px]"
          style={{ color: styles.accentColor }}
        >
          {phaseLabel}
        </Text>
        <Text className="mt-3 text-center text-3xl font-bold text-white">{title}</Text>

        <View className="mt-8 items-center justify-center" style={{ minHeight: "45%" }}>
          <Text className="text-[160px] font-black leading-[166px]" style={{ color: styles.accentColor }}>
            {phase === "complete" ? "0" : remaining}
          </Text>
        </View>

        {phase !== "complete" && activeSegment && (
          <View className="mb-6 rounded-2xl border border-white/15 bg-white/5 p-4">
            <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-white/70">
              {activeSegment.setName} ({activeSegment.setIndex + 1}/{activeSegment.setCount})
            </Text>
            <Text className="mt-1 text-center text-sm font-semibold uppercase tracking-[2px] text-white/70">
              Loop {activeSegment.loopIndex + 1}/{activeSegment.loopCount}
            </Text>
          </View>
        )}

        {phase === "rest" && upcomingWorkSegment && (
          <View className="mb-6 rounded-2xl border border-neon-blue/30 bg-neon-blue/10 p-4">
            <Text className="text-center text-xs font-semibold uppercase tracking-[2px] text-neon-blue">
              Up Next
            </Text>
            <Text className="mt-1 text-center text-xl font-black text-white">
              {upcomingWorkSegment.exerciseName}
            </Text>
            <Text className="mt-1 text-center text-xs font-semibold uppercase tracking-[1.5px] text-white/70">
              {upcomingWorkSegment.setName} • Loop {upcomingWorkSegment.loopIndex + 1}/
              {upcomingWorkSegment.loopCount}
            </Text>
          </View>
        )}

        {phase !== "complete" && (
          <View>
            <Pressable
              onPress={() => setIsRunning((current) => !current)}
              className="items-center rounded-2xl bg-white/10 py-4"
            >
              <Text className="text-lg font-bold text-white">{isRunning ? "Pause" : "Resume"}</Text>
            </Pressable>
            {(phase === "work" || phase === "rest") && (
              <Pressable
                onPress={skipCurrentSegment}
                className={`mt-3 items-center rounded-2xl py-4 ${
                  phase === "rest" ? "bg-neon-blue/25" : "bg-neon-amber/25"
                }`}
              >
                <Text
                  className={`text-base font-black ${
                    phase === "rest" ? "text-neon-blue" : "text-neon-amber"
                  }`}
                >
                  {phase === "rest" ? "Skip Rest" : "Skip Exercise"}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {phase === "complete" && (
          <Pressable onPress={handleBack} className="items-center rounded-2xl bg-neon-blue py-4">
            <Text className="text-lg font-black text-ink">Back to Dashboard</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
