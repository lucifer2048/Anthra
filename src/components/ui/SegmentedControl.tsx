import { Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";

export type SegmentOption<T extends string> = { label: string; value: T; icon?: LucideIcon };

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  style
}: {
  label?: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
  const stacked =
    fontScale >= 1.3 ||
    options.length >= 4 ||
    (width < 390 && options.length >= 3) ||
    width < 360;

  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={style}>
      {label ? <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{label}</Text> : null}
      <View
        style={{
          flexDirection: stacked ? "column" : "row",
          gap: theme.spacing.xs,
          padding: theme.spacing.xs,
          borderRadius: theme.radii.lg,
          borderWidth: theme.borderWidths.standard,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceSubtle
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const Icon = option.icon;
          return (
            <AnimatedPressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              haptic={selected ? "none" : "selection"}
              pressScale="subtle"
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled }}
              style={{ flex: stacked ? undefined : 1, minHeight: theme.sizes.control.compact }}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: theme.sizes.control.compact,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: theme.spacing.sm,
                  borderRadius: theme.radii.md,
                  backgroundColor: selected ? theme.colors.brandSolid : theme.colors.surface,
                  borderWidth: selected ? theme.borderWidths.standard : 0,
                  borderColor: selected ? theme.colors.brandBorder : "transparent"
                }}
              >
                {selected ? (
                  <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.duration.fast)} exiting={reduceMotion ? undefined : FadeOut.duration(theme.motion.duration.fast)} style={[theme.shadows.low, { position: "absolute", inset: 0, borderRadius: theme.radii.md }]} />
                ) : null}
                {Icon ? <Icon accessible={false} size={theme.sizes.icon.sm} color={selected ? theme.colors.textOnBrandSolid : theme.colors.textSecondary} /> : null}
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.3}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[theme.typography.labelLarge, { minWidth: 0, flexShrink: 1, textAlign: "center", color: selected ? theme.colors.textOnBrandSolid : theme.colors.textSecondary }]}
                >
                  {option.label}
                </Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}
