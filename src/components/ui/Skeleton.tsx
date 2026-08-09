import { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from "react-native-reanimated";
import { useAnthraTheme } from "../../design-system";
import { Card } from "./Surface";

export type SkeletonBlockProps = {
  width?: ViewStyle["width"];
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({ width = "100%", height = 16, radius, style }: SkeletonBlockProps) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.72 : 0.42);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 0.72;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.82, { duration: theme.motion.duration.slow * 3 }),
      -1,
      true
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion, theme.motion.duration.slow]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessible={false}
      style={[
        {
          width,
          height,
          borderRadius: radius ?? theme.radii.sm,
          backgroundColor: theme.colors.borderStrong
        },
        animatedStyle,
        style
      ]}
    />
  );
}

export function SkeletonRow({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useAnthraTheme();
  return (
    <View
      accessibilityLabel="Loading item"
      accessibilityState={{ busy: true }}
      style={[{ minHeight: theme.sizes.control.large, flexDirection: "row", alignItems: "center", gap: theme.spacing.md }, style]}
    >
      <SkeletonBlock width={theme.sizes.control.regular} height={theme.sizes.control.regular} radius={theme.radii.full} />
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        <SkeletonBlock width="58%" height={16} />
        <SkeletonBlock width="82%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonCard({ rows = 3, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useAnthraTheme();
  return (
    <Card accessibilityLabel="Loading content" accessibilityState={{ busy: true }} style={style}>
      <View style={{ gap: theme.spacing.lg }}>
        {Array.from({ length: rows }, (_, index) => <SkeletonRow key={index} />)}
      </View>
    </Card>
  );
}
