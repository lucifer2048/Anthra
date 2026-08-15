import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { WEEKDAY_OPTIONS, normalizeDays } from "../../constants/schedule";
import { AnimatedPressable } from "./AnimatedPressable";

export type WeekdayPickerProps = {
  label?: string;
  value: number[];
  onChange: (days: number[]) => void;
  /** When true, at least one day must remain selected. */
  requireOne?: boolean;
  variant?: "chip" | "card";
  disabled?: boolean;
  error?: string;
  style?: StyleProp<ViewStyle>;
};

export function WeekdayPicker({
  label,
  value,
  onChange,
  requireOne = false,
  disabled = false,
  error,
  style
}: WeekdayPickerProps) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.25;
  const selected = normalizeDays(value);

  const toggle = (day: number) => {
    const active = selected.includes(day);
    if (active) {
      const next = selected.filter((entry) => entry !== day);
      if (requireOne && next.length === 0) return;
      onChange(next);
      return;
    }
    onChange(normalizeDays([...selected, day]));
  };

  return (
    <View style={style}>
      {label ? (
        <Text
          style={[
            theme.typography.label,
            { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }
          ]}
        >
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: compact ? 3 : 5
        }}
      >
        {WEEKDAY_OPTIONS.map((day) => {
          const active = selected.includes(day.value);
          return (
            <AnimatedPressable
              key={day.value}
              onPress={() => toggle(day.value)}
              disabled={disabled}
              haptic="selection"
              pressScale="subtle"
              accessibilityRole="checkbox"
              accessibilityLabel={`${day.label}, ${active ? "selected" : "not selected"}`}
              accessibilityState={{ checked: active, selected: active, disabled }}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: compact ? 38 : 42,
                height: compact ? 38 : 42,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 2,
                borderRadius: theme.radii.lg,
                borderWidth: active ? 1.5 : 1,
                borderColor: active
                  ? theme.colors.brandBorder
                  : theme.colors.border,
                backgroundColor: active
                  ? theme.colors.brandSoft
                  : pressed
                    ? theme.colors.surfacePressed
                    : theme.colors.surfaceElevated,
                opacity: disabled ? theme.motion.disabledOpacity : 1,
                ...(active ? theme.shadows.low : {})
              })}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                maxFontSizeMultiplier={1.2}
                style={[
                  theme.typography.caption,
                  {
                    color: active ? theme.colors.brand : theme.colors.textSecondary,
                    fontWeight: active ? "700" : "600",
                    textAlign: "center"
                  }
                ]}
              >
                {day.short}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[theme.typography.caption, { color: theme.colors.danger, marginTop: theme.spacing.xs }]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
