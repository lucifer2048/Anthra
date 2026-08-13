import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Animated,
  BackHandler,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions
} from "react-native";
import * as Haptics from "expo-haptics";
import { useKeepAwake } from "expo-keep-awake";
import Svg, { Rect } from "react-native-svg";
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
import { Button, Card, IconButton, ProgressBar } from "./ui";
import { TimerPreferenceToggle } from "./TimerPreferenceToggle";

type TimerScreenProps = {
  plan: WorkoutPlan;
  onBack: (summary: WorkoutRunSummary) => Promise<void> | void;
  onComplete: (summary: WorkoutRunSummary) => Promise<void>;
  initialState?: WorkoutTimerState | null;
  onStateChange?: (state: WorkoutTimerState) => void;
  accentColor?: string;
  accentSoftColor?: string;
};

const AnimatedRect = Animated.createAnimatedComponent(Rect);

type PhaseTimerTagProps = {
  accentColor: string;
  animationKey: string;
  backgroundColor: string;
  durationSeconds: number;
  isCompact: boolean;
  isRunning: boolean;
  label: string;
  remainingSeconds: number;
  width: number;
};

function PhaseTimerTag({
  accentColor,
  animationKey,
  backgroundColor,
  durationSeconds,
  isCompact,
  isRunning,
  label,
  remainingSeconds,
  width
}: PhaseTimerTagProps) {
  const theme = useAnthraTheme();
  const [reduceMotion, setReduceMotion] = useState(false);
  const height = isCompact ? 51 : 56;
  const strokeWidth = 2.5;
  const inset = strokeWidth / 2;
  const radius = (height - strokeWidth) / 2;
  const perimeter = 2 * (width - strokeWidth - 2 * radius)
    + 2 * (height - strokeWidth - 2 * radius)
    + 2 * Math.PI * radius;
  const progress = useRef(new Animated.Value(1)).current;
  const safeDuration = Math.max(1, durationSeconds);
  const remainingRatio = Math.max(0, Math.min(1, remainingSeconds / safeDuration));

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(remainingRatio);

    if (isRunning && !reduceMotion && remainingSeconds > 0) {
      Animated.timing(progress, {
        toValue: 0,
        duration: remainingSeconds * 1000,
        useNativeDriver: false
      }).start();
    }

    return () => progress.stopAnimation();
    // The animation runs continuously between timer or phase state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationKey, durationSeconds, isRunning, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) progress.setValue(remainingRatio);
  }, [progress, reduceMotion, remainingRatio]);

  const dashOffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [perimeter, 0]
  });

  return (
    <View
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: theme.radii.full,
        backgroundColor
      }}
    >
      <Svg
        accessible={false}
        pointerEvents="none"
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0 }}
      >
        <Rect
          x={inset}
          y={inset}
          width={width - strokeWidth}
          height={height - strokeWidth}
          rx={radius}
          fill="none"
          stroke={accentColor}
          strokeOpacity={0.22}
          strokeWidth={strokeWidth}
        />
        <AnimatedRect
          x={inset}
          y={inset}
          width={width - strokeWidth}
          height={height - strokeWidth}
          rx={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${perimeter} ${perimeter}`}
          strokeDashoffset={dashOffset}
        />
      </Svg>
      <Text
        style={[
          theme.typography.labelLarge,
          {
            color: accentColor,
            textAlign: "center",
            fontSize: isCompact ? 25 : 30,
            lineHeight: isCompact ? 31 : 36,
            fontWeight: "800",
            letterSpacing: 2.2
          }
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

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
  const shouldStackActions = width < 360 || fontScale >= 1.35;
  const timerFontSize = useMemo(() => {
    const lengthScale = timerValue.length <= 2 ? 1 : timerValue.length === 3 ? 0.76 : 0.56;
    const nextSize = Math.min(width * 0.68, height * (isCompactHeight ? 0.26 : 0.3)) * lengthScale;
    return Math.max(isCompactHeight ? 108 : 132, Math.min(isCompactHeight ? 184 : 248, nextSize));
  }, [height, isCompactHeight, timerValue.length, width]);
  const isRestPhase = phase === "rest";
  const isActiveInterval = phase === "work" || phase === "rest";
  const phaseAccent = isRestPhase ? theme.colors.info : activeAccent;
  const phaseAccentSurface = isRestPhase ? theme.colors.infoSoft : activeAccentSurface;
  const phaseBackground = isActiveInterval
    ? {
        color: theme.colors.canvas,
        gradient: {
          colors: [phaseAccentSurface, theme.colors.canvas, theme.colors.canvas],
          start: { x: 0.5, y: 0 },
          end: { x: 0.5, y: 0.72 },
          locations: [0, 0.5, 1]
        }
      }
    : backgrounds.canvas;

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
    <ScreenLayout {...phaseBackground} safeAreaEdges={["top", "bottom"]}>
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
            <Text style={[theme.typography.label, { color: phaseAccent }]}>WORKOUT</Text>
            <Text numberOfLines={1} style={[theme.typography.titleSmall, { color: textPrimaryColor, marginTop: theme.spacing.xs }]}>
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
            <ProgressBar value={progressPercent} max={100} fillColor={phaseAccent} height={theme.spacing.xs} style={{ flex: 1 }} accessibilityLabel="Workout progress" />
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
          {isActiveInterval ? (
            <PhaseTimerTag
              accentColor={phaseAccent}
              animationKey={`${phase}:${segmentIndex}`}
              backgroundColor={phaseAccentSurface}
              durationSeconds={currentSegment?.seconds ?? remaining}
              isCompact={isCompactHeight}
              isRunning={isRunning}
              label={phaseLabel}
              remainingSeconds={remaining}
              width={Math.min(184, width - 64)}
            />
          ) : (
            <View
              style={{
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.full,
                backgroundColor: phaseAccentSurface
              }}
            >
              <Text
                style={[
                  theme.typography.labelLarge,
                  {
                    color: phaseAccent,
                    textAlign: "center",
                    fontSize: 13,
                    lineHeight: 18,
                    fontWeight: "600",
                    letterSpacing: 0.9
                  }
                ]}
              >
                {phaseLabel}
              </Text>
            </View>
          )}

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
                color: phaseAccent,
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
                { color: phase === "complete" ? textMutedColor : phaseAccent, letterSpacing: 1 }
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
          <Card
            variant="brand"
            treatment="inset"
            padding="small"
            className="mt-3 flex-row items-center"
          >
            <Text
              numberOfLines={2}
              style={[theme.typography.bodyStrong, { color: textPrimaryColor, flex: 1, minWidth: 0 }]}
            >
              Skipped {skippedState.phase === "rest" ? "rest" : "exercise"}
            </Text>
            <View style={{ flexShrink: 0 }}>
              <Button label="Undo" icon={RotateCcw} onPress={undoSkip} variant="ghost" size="small" />
            </View>
          </Card>
        )}

        {phase !== "complete" && !focusMode && (
          <View style={{ alignItems: "center", marginTop: theme.spacing.sm }}>
            <View
              className="flex-row items-center"
              style={{
                gap: theme.spacing.md
              }}
            >
              <TimerPreferenceToggle label="Sound" enabled={soundEnabled} onChange={setSoundEnabled} enabledIcon={Volume2} disabledIcon={VolumeX} accent={phaseAccent} accentSurface={phaseAccentSurface} width={Math.min(128, (width - theme.layout.screenPadding * 2 - theme.spacing.md) / 2)} />
              <TimerPreferenceToggle label="Vibration" enabled={hapticsEnabled} onChange={setHapticsEnabled} enabledIcon={Vibrate} disabledIcon={VibrateOff} accent={phaseAccent} accentSurface={phaseAccentSurface} width={Math.min(128, (width - theme.layout.screenPadding * 2 - theme.spacing.md) / 2)} />
            </View>
          </View>
        )}

        {phase === "complete" && (
          <View>
            <View className="items-center" style={{ marginBottom: theme.spacing.md }}>
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 48, height: 48, backgroundColor: phaseAccentSurface }}
              >
                <Check accessible={false} color={phaseAccent} size={26} strokeWidth={2.5} />
              </View>
              <Text style={[theme.typography.bodyStrong, { color: phaseAccent, marginTop: theme.spacing.sm }]}>
                You showed up. That counts.
              </Text>
            </View>
            <Card
              variant="brand"
              treatment="stat"
              style={{
                flexDirection: shouldStackActions ? "column" : "row",
                gap: shouldStackActions ? theme.spacing.md : 0
              }}
            >
              <View className="flex-1 items-center" style={{ minWidth: 0 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[theme.typography.titleLarge, { color: textPrimaryColor }]}>
                  {formatWorkoutDuration(getRunSummary(true).elapsedSeconds)}
                </Text>
                <Text numberOfLines={1} style={[theme.typography.caption, { color: textMutedColor, marginTop: theme.spacing.xs }]}>Time invested</Text>
              </View>
              {!shouldStackActions ? <View className="w-px" style={{ backgroundColor: theme.colors.divider }} /> : null}
              <View className="flex-1 items-center" style={{ minWidth: 0 }}>
                <Text numberOfLines={1} style={[theme.typography.titleLarge, { color: textPrimaryColor }]}>{timeline.workSegmentCount}</Text>
                <Text numberOfLines={1} style={[theme.typography.caption, { color: textMutedColor, marginTop: theme.spacing.xs }]}>Work rounds</Text>
              </View>
            </Card>
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
            borderTopColor: isActiveInterval ? phaseAccent : theme.colors.divider,
            backgroundColor: isActiveInterval ? phaseAccentSurface : theme.colors.canvas,
            ...theme.shadows.overlay
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
