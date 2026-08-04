import { useEffect } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useAnthraTheme } from "../../design-system";

export type ProgressBarProps = {
  value: number;
  max: number;
  fillColor?: string;
  trackColor?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityValue?: ViewProps["accessibilityValue"];
  accessibilityValueText?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function ProgressBar({
  value,
  max,
  fillColor,
  trackColor,
  accessibilityLabel = "Progress",
  accessibilityHint,
  accessibilityValue,
  accessibilityValueText,
  height = 12,
  style,
  testID
}: ProgressBarProps) {
  const theme = useAnthraTheme();
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const finiteValue = Number.isFinite(value) ? value : 0;
  const safeValue = Math.min(safeMax, Math.max(0, finiteValue));
  const ratio = safeValue / safeMax;
  const reduceMotion = useReducedMotion();
  const animatedRatio = useSharedValue(0);
  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, animatedRatio.value)) * 100}%` as `${number}%`
  }));
  const resolvedFill = fillColor ?? theme.colors.brand;
  const resolvedTrack = trackColor ?? theme.colors.progressTrack;

  useEffect(() => {
    animatedRatio.value = reduceMotion
      ? ratio
      : withTiming(ratio, { duration: 620, easing: Easing.out(Easing.cubic) });
  }, [animatedRatio, ratio, reduceMotion]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityValue={accessibilityValue ?? {
        min: 0,
        max: safeMax,
        now: safeValue,
        text: accessibilityValueText
      }}
      testID={testID}
      className="w-full overflow-hidden rounded-full"
      style={[{ height, backgroundColor: resolvedTrack }, style]}
    >
      <Animated.View
        accessible={false}
        className="rounded-full"
        style={[{ height, backgroundColor: resolvedFill }, animatedFillStyle]}
      />
    </View>
  );
}
