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
  variant = "luxury",
  style
}: {
  label?: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  variant?: "luxury" | "solid";
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.75 || (width < 320 && options.length > 3);
  const isSolid = variant === "solid";

  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={style}>
      {label ? <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{label}</Text> : null}
      <View
        style={{
          flexDirection: stacked ? "column" : "row",
          gap: 4,
          padding: 3,
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.isDark ? theme.colors.surfaceElevated : theme.colors.surfaceSubtle,
          ...theme.shadows.low
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const Icon = option.icon;
          const selectedBg = isSolid
            ? theme.colors.brandSolid
            : theme.isDark
              ? theme.colors.brandSoft
              : theme.colors.surface;
          const selectedText = isSolid ? theme.colors.textOnBrandSolid : theme.colors.brand;
          const selectedBorder = isSolid
            ? "rgba(255,255,255,0.15)"
            : theme.isDark
              ? theme.colors.brandBorder
              : "rgba(0,0,0,0.06)";

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
              style={{
                flex: stacked ? undefined : 1,
                minWidth: 0,
                minHeight: 36
              }}
            >
              <View
                style={{
                  flex: 1,
                  minHeight: 36,
                  paddingHorizontal: 4,
                  paddingVertical: 7,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  borderRadius: theme.radii.lg,
                  backgroundColor: selected ? selectedBg : "transparent",
                  borderWidth: 1,
                  borderColor: selected ? selectedBorder : "transparent",
                  ...(selected ? (theme.isDark ? theme.shadows.low : { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 }) : {})
                }}
              >
                {Icon ? (
                  <Icon
                    accessible={false}
                    size={13}
                    strokeWidth={selected ? 2.3 : 1.8}
                    color={selected ? selectedText : theme.colors.textSecondary}
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  style={[
                    theme.typography.label,
                    {
                      flexShrink: 1,
                      textAlign: "center",
                      fontWeight: selected ? "700" : "600",
                      color: selected ? selectedText : theme.colors.textSecondary
                    }
                  ]}
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
