import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import {
  Check,
  Eye,
  EyeOff,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Vibrate,
  VibrateOff,
  Volume2,
  VolumeX
} from "lucide-react-native";
import { ScreenLayout, useScreenBackgrounds } from "./layout";

import { useAnthraTheme } from "../design-system";
import type {
  TimerPhase,
  WorkoutPlan,
  WorkoutRunSummary,
  WorkoutTimerState
} from "../types";
import {
  buildWorkoutTimeline,
  formatWorkoutDuration,
  getWorkoutTimelineProgress
} from "../features/workout/workoutTimeline";
import { useAudioCues } from "../hooks/useAudioCues";
import { Button, IconButton, Surface } from "./ui";

type TimerScreenProps = {
  plan: WorkoutPlan;
  onBack: (summary: WorkoutRunSummary) => Promise<void> | void;
  onComplete: (summary: WorkoutRunSummary) => Promise<void>;
  initialState?: WorkoutTimerState | null;
  onStateChange?: (state: WorkoutTimerState) => void;
  accentColor?: string;
  accentSoftColor?: string;
};

export function TimerScreen({
  plan,
  onBack,
  onComplete,
  initialState,
  onStateChange,
  accentColor,
  accentSoftColor
}: TimerScreenProps) {
  useKeepAwake();
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { fontScale, height, width } = useWindowDimensions();
  const timeline = useMemo(() => buildWorkoutTimeline(plan), [plan]);
  const segments = timeline.segments;
  const [phase, setPhase] = useState<TimerPhase>(initialState?.phase ?? "ready");
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor(initialState?.remainingSeconds ?? 5))
  );
  const [segmentIndex, setSegmentIndex] = useState(() =>
    Math.max(0, Math.floor(initialState?.segmentIndex ?? 0))
  );
  const [isRunning, setIsRunning] = useState(initialState ? false : true);
  const startedAtRef = useRef(initialState?.startedAt ?? Date.now());
  const deadlineRef = useRef(Date.now() + Math.max(0, initialState?.remainingSeconds ?? 5) * 1000);
  const completionHandled = useRef(false);
  const backHandled = useRef(false);
  const exitPromptOpen = useRef(false);
  const undoSkipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCueKeyRef = useRef<string | null>(null);
  const { playShort, playLong } = useAudioCues();
  const [focusMode, setFocusMode] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [skippedState, setSkippedState] = useState<{
    phase: TimerPhase;
    segmentIndex: number;
    remaining: number;
    wasRunning: boolean;
  } | null>(null);

  const activeSegment = segments[segmentIndex] ?? null;
  const currentSegment = phase === "ready" ? segments[0] ?? null : activeSegment;
  const activeAccent = accentColor ?? theme.colors.brand;
  const activeAccentSurface = accentSoftColor ?? theme.colors.brandSoft;
  const textPrimaryColor = theme.colors.textPrimary;
  const textMutedColor = theme.colors.textSecondary;
  const timerValue = phase === "complete" ? "DONE" : String(remaining);
  const isCompactHeight = height <= 700;
  const shouldStackActions = width < 350 || fontScale >= 1.35;
  const timerFontSize = useMemo(() => {
    const lengthScale = timerValue.length <= 2 ? 1 : timerValue.length === 3 ? 0.76 : 0.56;
    const nextSize = Math.min(width * 0.68, height * (isCompactHeight ? 0.26 : 0.3)) * lengthScale;
    return Math.max(isCompactHeight ? 108 : 132, Math.min(isCompactHeight ? 184 : 248, nextSize));
  }, [height, isCompactHeight, timerValue.length, width]);
  const isRestPhase = phase === "rest";
  const isActiveInterval = phase === "work" || phase === "rest";

  const triggerCountdownCue = useCallback(() => {
    if (soundEnabled) playShort();
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [hapticsEnabled, playShort, soundEnabled]);

  const triggerTransitionCue = useCallback(() => {
    if (soundEnabled) playLong();
    if (hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [hapticsEnabled, playLong, soundEnabled]);

  const getRunSummary = useCallback(
    (forceCompleted = false): WorkoutRunSummary => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000));
      const progress = getWorkoutTimelineProgress(timeline, {
        phase: forceCompleted ? "complete" : phase,
        segmentIndex,
        remainingSeconds: remaining
      });

      return {
        completed: forceCompleted || phase === "complete",
        progressPercent: progress.progressPercent,
        completedSegments: progress.completedSegments,
        totalSegments: progress.totalSegments,
        elapsedSeconds
      };
    },
    [phase, remaining, segmentIndex, timeline]
  );

  useEffect(() => {
    if (phase === "complete") return;
    onStateChange?.({
      phase,
      segmentIndex,
      remainingSeconds: remaining,
      isRunning,
      startedAt: startedAtRef.current,
      summary: getRunSummary(false)
    });
  }, [getRunSummary, isRunning, onStateChange, phase, remaining, segmentIndex]);

  const advancePhase = useCallback(() => {
    if (phase === "ready") {
      if (segments.length === 0) {
        setPhase("complete");
        setIsRunning(false);
        return;
      }
      const seconds = segments[0].seconds;
      deadlineRef.current = Date.now() + seconds * 1000;
      setPhase(segments[0].kind);
      setSegmentIndex(0);
      setRemaining(seconds);
      return;
    }

    const nextIndex = segmentIndex + 1;
    if (nextIndex >= segments.length) {
      setPhase("complete");
      setIsRunning(false);
      return;
    }

    const seconds = segments[nextIndex].seconds;
    deadlineRef.current = Date.now() + seconds * 1000;
    setSegmentIndex(nextIndex);
    setPhase(segments[nextIndex].kind);
    setRemaining(seconds);
  }, [phase, segmentIndex, segments]);

  useEffect(() => {
    if (!isRunning || phase === "complete") return;
    // Recalculate deadline from current remaining when resuming after pause
    deadlineRef.current = Date.now() + remaining * 1000;
    // Use wall-clock based computation instead of counter decrement to avoid
    // timer drift on Android/Hermes where setInterval(1000) can fire late.
    const interval = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(left);
    }, 250);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase]);

  useEffect(() => {
    if (!isRunning || phase === "complete") return;

    const cueKey = `${phase}:${segmentIndex}:${remaining}`;
    if (lastCueKeyRef.current === cueKey) return;

    if (remaining > 0 && remaining <= 3) {
      lastCueKeyRef.current = cueKey;
      triggerCountdownCue();
      return;
    }

    if (remaining === 0) {
      lastCueKeyRef.current = cueKey;
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

  const featuredSegment = isRestPhase ? upcomingWorkSegment : currentSegment;
  const featuredExerciseLabel = phase === "rest"
    ? "UP NEXT"
    : phase === "work"
      ? "CURRENT EXERCISE"
      : phase === "ready"
        ? "STARTING WITH"
        : "SESSION COMPLETE";
  const featuredExerciseName = phase === "complete"
    ? "Great session."
    : featuredSegment?.exerciseName ?? (isRestPhase ? "Final rest" : "Get ready");

  const progressPercent = useMemo(() => {
    return getWorkoutTimelineProgress(timeline, {
      phase,
      segmentIndex,
      remainingSeconds: remaining
    }).progressPercent;
  }, [phase, remaining, segmentIndex, timeline]);

  const skipCurrentSegment = useCallback(() => {
    if (phase !== "work" && phase !== "rest") return;
    setSkippedState({ phase, segmentIndex, remaining, wasRunning: isRunning });
    if (undoSkipTimeoutRef.current) clearTimeout(undoSkipTimeoutRef.current);
    undoSkipTimeoutRef.current = setTimeout(() => setSkippedState(null), 5000);
    triggerTransitionCue();
    advancePhase();
  }, [advancePhase, isRunning, phase, remaining, segmentIndex, triggerTransitionCue]);

  const undoSkip = useCallback(() => {
    if (!skippedState) return;
    if (undoSkipTimeoutRef.current) clearTimeout(undoSkipTimeoutRef.current);
    // Work-to-work skips keep the same phase, so the phase-driven timer effect
    // will not run again. Restore the wall-clock deadline explicitly.
    deadlineRef.current = Date.now() + skippedState.remaining * 1000;
    lastCueKeyRef.current = null;
    setPhase(skippedState.phase);
    setSegmentIndex(skippedState.segmentIndex);
    setRemaining(skippedState.remaining);
    setIsRunning(skippedState.wasRunning);
    setSkippedState(null);
  }, [skippedState]);

  useEffect(
    () => () => {
      if (undoSkipTimeoutRef.current) clearTimeout(undoSkipTimeoutRef.current);
    },
    []
  );

  const handleBack = useCallback(() => {
    if (backHandled.current) return;
    backHandled.current = true;
    setIsRunning(false);
    const summary = getRunSummary(phase === "complete");
    Promise.resolve(onBack(summary)).catch(() => undefined);
  }, [getRunSummary, onBack, phase]);

  const requestExit = useCallback(() => {
    if (phase === "complete") {
      handleBack();
      return;
    }
    if (exitPromptOpen.current) return;

    exitPromptOpen.current = true;
    const wasRunning = isRunning;
    setIsRunning(false);
    Alert.alert(
      "Exit workout?",
      "Your progress will be saved, and this workout will end.",
      [
        {
          text: "Keep Training",
          style: "cancel",
          onPress: () => {
            exitPromptOpen.current = false;
            if (wasRunning) setIsRunning(true);
          }
        },
        {
          text: "Exit Workout",
          style: "destructive",
          onPress: () => {
            exitPromptOpen.current = false;
            handleBack();
          }
        }
      ],
      {
        cancelable: true,
        onDismiss: () => {
          exitPromptOpen.current = false;
          if (wasRunning) setIsRunning(true);
        }
      }
    );
  }, [handleBack, isRunning, phase]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestExit();
      return true;
    });
    return () => subscription.remove();
  }, [requestExit]);

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: theme.layout.screenPadding,
          paddingBottom: isCompactHeight ? theme.spacing.md : theme.spacing.lg,
          paddingTop: theme.spacing.md
        }}
        alwaysBounceVertical={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between" style={{ gap: theme.spacing.md }}>
          <View className="min-w-0 flex-1">
            <Text style={[theme.typography.label, { color: activeAccent }]}>WORKOUT</Text>
            <Text numberOfLines={1} style={[theme.typography.titleSmall, { color: textPrimaryColor, marginTop: 2 }]}>
              {plan.name}
            </Text>
          </View>
          <View className="flex-row" style={{ gap: theme.spacing.xs }}>
            <IconButton
              icon={focusMode ? Eye : EyeOff}
              onPress={() => setFocusMode((enabled) => !enabled)}
              accessibilityLabel={focusMode ? "Show workout details" : "Enter focus mode"}
              accessibilityState={{ selected: focusMode }}
              variant={focusMode ? "primary" : "standard"}
            />
            <IconButton
              icon={LogOut}
              onPress={requestExit}
              accessibilityLabel="Exit workout"
              variant="ghost"
              color={theme.colors.danger}
            />
          </View>
        </View>

        {!focusMode && (
          <View className="flex-row items-center" style={{ gap: theme.spacing.md, marginTop: theme.spacing.md }}>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Workout progress"
              accessibilityValue={{ min: 0, max: 100, now: Math.round(progressPercent) }}
              className="flex-1 overflow-hidden rounded-full"
              style={{ height: 4, backgroundColor: theme.colors.progressTrack }}
            >
              <View
                className="rounded-full"
                style={{ width: `${progressPercent}%`, height: 4, backgroundColor: activeAccent }}
              />
            </View>
            <Text style={[theme.typography.caption, { color: textMutedColor }]}>{Math.round(progressPercent)}%</Text>
          </View>
        )}

        <View
          className="items-center justify-center"
          style={{
            flexGrow: 1,
            minHeight: isCompactHeight ? 320 : 430,
            paddingTop: isCompactHeight ? theme.spacing.lg : theme.spacing["2xl"],
            paddingBottom: isCompactHeight ? theme.spacing.md : theme.spacing.xl
          }}
        >
          <View
            style={{
              minWidth: isActiveInterval ? Math.min(124, width - 64) : undefined,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: 6,
              borderRadius: theme.radii.full,
              backgroundColor: activeAccentSurface
            }}
          >
            <Text
              style={[
                theme.typography.labelLarge,
                {
                  color: activeAccent,
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: 18,
                  letterSpacing: 0.9
                }
              ]}
            >
              {phaseLabel}
            </Text>
          </View>

          <View
            className="w-full items-center justify-center"
            style={{
              minHeight: isCompactHeight ? 146 : 202,
              marginTop: isCompactHeight ? theme.spacing.xs : theme.spacing.sm
            }}
          >
            <Text
              accessible
              accessibilityRole="timer"
              accessibilityLabel={phase === "complete" ? "Workout complete" : `${remaining} seconds remaining`}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1}
              minimumFontScale={0.62}
              numberOfLines={1}
              style={{
                color: activeAccent,
                fontSize: timerFontSize,
                lineHeight: timerFontSize * 1.02,
                fontFamily: theme.typography.display.fontFamily,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
                includeFontPadding: false,
                letterSpacing: timerValue.length === 1 ? 0 : timerValue.length === 2 ? -5 : -2,
                textAlign: "center"
              }}
            >
              {timerValue}
            </Text>
          </View>

          <View
            accessible
            accessibilityRole="header"
            style={{ width: "100%", alignItems: "center", paddingHorizontal: theme.spacing.sm }}
          >
            <Text
              style={[
                theme.typography.caption,
                { color: phase === "complete" ? textMutedColor : activeAccent, letterSpacing: 1 }
              ]}
            >
              {featuredExerciseLabel}
            </Text>
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
              style={{
                color: textPrimaryColor,
                fontFamily: theme.typography.titleLarge.fontFamily,
                fontSize: isCompactHeight ? 28 : 34,
                lineHeight: isCompactHeight ? 34 : 41,
                fontWeight: "700",
                letterSpacing: -0.4,
                marginTop: theme.spacing.xs,
                textAlign: "center"
              }}
            >
              {featuredExerciseName}
            </Text>
            {phase !== "complete" && featuredSegment && (
              <Text
                numberOfLines={1}
                style={[
                  theme.typography.body,
                  { color: textMutedColor, marginTop: theme.spacing.xs, textAlign: "center" }
                ]}
              >
                {featuredSegment.setName} · Round {featuredSegment.loopIndex + 1} of {featuredSegment.loopCount}
              </Text>
            )}
          </View>
        </View>

        {skippedState && phase !== "complete" && (
          <Surface
            variant="brand"
            padding="small"
            radius="medium"
            bordered
            className="mt-3 flex-row items-center"
          >
            <Text style={[theme.typography.bodyStrong, { color: textPrimaryColor, flex: 1 }]}>
              Skipped {skippedState.phase === "rest" ? "rest" : "exercise"}
            </Text>
            <Button label="Undo" icon={RotateCcw} onPress={undoSkip} variant="ghost" size="small" />
          </Surface>
        )}

        {phase !== "complete" && !focusMode && (
          <View style={{ alignItems: "center", marginTop: theme.spacing.sm }}>
            <View
              className="flex-row items-center"
              style={{
                gap: theme.spacing.md
              }}
            >
              <Pressable
                onPress={() => setSoundEnabled((enabled) => !enabled)}
                accessibilityRole="switch"
                accessibilityState={{ checked: soundEnabled }}
                accessibilityLabel="Workout sounds"
                style={({ pressed }) => ({
                  width: Math.min(
                    128,
                    (width - theme.layout.screenPadding * 2 - theme.spacing.md) / 2
                  ),
                  minHeight: 48,
                  gap: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: theme.radii.full,
                  borderWidth: 1,
                  borderColor: soundEnabled ? theme.colors.brandBorder : theme.colors.border,
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated,
                  transform: [{ scale: pressed ? theme.motion.pressedScale : 1 }]
                })}
              >
                <View
                  className="items-center justify-center"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: theme.radii.full,
                    backgroundColor: soundEnabled ? activeAccentSurface : theme.colors.surfaceSubtle
                  }}
                >
                  {soundEnabled
                    ? <Volume2 accessible={false} color={activeAccent} size={17} />
                    : <VolumeX accessible={false} color={textMutedColor} size={17} />}
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[theme.typography.label, { color: textPrimaryColor }]}
                  >
                    Sound
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setHapticsEnabled((enabled) => !enabled)}
                accessibilityRole="switch"
                accessibilityState={{ checked: hapticsEnabled }}
                accessibilityLabel="Workout vibration"
                style={({ pressed }) => ({
                  width: Math.min(
                    128,
                    (width - theme.layout.screenPadding * 2 - theme.spacing.md) / 2
                  ),
                  minHeight: 48,
                  gap: theme.spacing.sm,
                  paddingHorizontal: theme.spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: theme.radii.full,
                  borderWidth: 1,
                  borderColor: hapticsEnabled ? theme.colors.brandBorder : theme.colors.border,
                  backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated,
                  transform: [{ scale: pressed ? theme.motion.pressedScale : 1 }]
                })}
              >
                <View
                  className="items-center justify-center"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: theme.radii.full,
                    backgroundColor: hapticsEnabled ? activeAccentSurface : theme.colors.surfaceSubtle
                  }}
                >
                  {hapticsEnabled
                    ? <Vibrate accessible={false} color={activeAccent} size={17} />
                    : <VibrateOff accessible={false} color={textMutedColor} size={17} />}
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.68}
                    style={[theme.typography.label, { color: textPrimaryColor }]}
                  >
                    Vibration
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {phase === "complete" && (
          <View>
            <View className="items-center" style={{ marginBottom: theme.spacing.md }}>
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 48, height: 48, backgroundColor: activeAccentSurface }}
              >
                <Check accessible={false} color={activeAccent} size={26} strokeWidth={2.5} />
              </View>
              <Text style={[theme.typography.bodyStrong, { color: activeAccent, marginTop: theme.spacing.sm }]}>
                You showed up. That counts.
              </Text>
            </View>
            <Surface
              variant="brand"
              padding="medium"
              radius="medium"
              bordered
              className="flex-row"
            >
              <View className="flex-1 items-center">
                <Text style={[theme.typography.titleLarge, { color: textPrimaryColor }]}>
                  {formatWorkoutDuration(getRunSummary(true).elapsedSeconds)}
                </Text>
                <Text style={[theme.typography.caption, { color: textMutedColor, marginTop: 2 }]}>Time invested</Text>
              </View>
              <View className="w-px" style={{ backgroundColor: theme.colors.divider }} />
              <View className="flex-1 items-center">
                <Text style={[theme.typography.titleLarge, { color: textPrimaryColor }]}>{timeline.workSegmentCount}</Text>
                <Text style={[theme.typography.caption, { color: textMutedColor, marginTop: 2 }]}>Work rounds</Text>
              </View>
            </Surface>
            <Button
              label="Back to workouts"
              onPress={requestExit}
              variant="primary"
              size="large"
              fullWidth
              style={{ marginTop: theme.spacing.lg }}
            />
          </View>
        )}
      </ScrollView>

      {phase !== "complete" && (
        <View
          style={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.md,
            paddingBottom: isCompactHeight ? theme.spacing.md : theme.spacing.lg,
            borderTopWidth: 1,
            borderTopColor: theme.colors.divider,
            backgroundColor: theme.colors.canvas,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: theme.isDark ? 0.22 : 0.05,
            shadowRadius: 12,
            elevation: 8
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: theme.layout.contentMaxWidth,
              alignSelf: "center",
              flexDirection: shouldStackActions ? "column" : "row",
              gap: theme.spacing.sm
            }}
          >
            <Button
              label={isRunning ? "Pause" : "Resume"}
              icon={isRunning ? Pause : Play}
              onPress={() => setIsRunning((current) => !current)}
              variant="primary"
              size="large"
              style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
            />
            {(phase === "work" || phase === "rest") && (
              <Button
                label={phase === "rest" ? "Skip rest" : "Skip exercise"}
                icon={SkipForward}
                onPress={skipCurrentSegment}
                variant="outline"
                size="large"
                style={{ flex: shouldStackActions ? undefined : 1, alignSelf: "stretch" }}
              />
            )}
          </View>
        </View>
      )}
    </ScreenLayout>
  );
}
