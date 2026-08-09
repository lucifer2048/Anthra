import { useCallback } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps } from "react-native";
import * as Haptics from "expo-haptics";
import { useAnthraTheme } from "../../design-system";

export type HapticMode = "none" | "selection" | "light" | "success" | "warning";
export type PressScale = "subtle" | "tactile" | "icon" | number;

export type AnimatedPressableProps = PressableProps & {
  haptic?: HapticMode;
  pressScale?: PressScale;
};

function triggerHaptic(mode: HapticMode) {
  if (mode === "none") return;
  const feedback = mode === "selection"
    ? Haptics.selectionAsync()
    : mode === "light"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          mode === "success"
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning
        );
  feedback.catch(() => undefined);
}

export function AnimatedPressable({
  children,
  disabled = false,
  haptic = "none",
  pressScale = "tactile",
  onPress,
  onPressIn,
  onPressOut,
  style,
  ...props
}: AnimatedPressableProps) {
  const theme = useAnthraTheme();
  const resolvedScale = typeof pressScale === "number"
    ? pressScale
    : theme.motion.pressedScales[pressScale];

  const handlePress = useCallback((event: GestureResponderEvent) => {
    if (!disabled) triggerHaptic(haptic);
    onPress?.(event);
  }, [disabled, haptic, onPress]);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={(event) => {
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        onPressOut?.(event);
      }}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        {
          opacity: disabled ? theme.motion.disabledOpacity : 1,
          transform: [{ scale: state.pressed && !disabled ? resolvedScale : 1 }]
        }
      ]}
    >
      {children}
    </Pressable>
  );
}
