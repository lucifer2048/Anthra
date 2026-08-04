import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { WEEKDAY_OPTIONS, normalizeDays } from "../../constants/schedule";
import { ChoiceChip } from "./ChoiceRow";

export type WeekdayPickerProps = {
  label?: string;
  value: number[];
  onChange: (days: number[]) => void;
  /** When true, at least one day must remain selected. */
  requireOne?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function WeekdayPicker({
  label,
  value,
  onChange,
  requireOne = false,
  style
}: WeekdayPickerProps) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 520 || fontScale >= 1.2;
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
      <View className="flex-row flex-wrap" style={{ gap: theme.spacing.sm }}>
        {WEEKDAY_OPTIONS.map((day) => {
          const active = selected.includes(day.value);
          return (
            <View key={day.value} style={{ width: compact ? "22%" : "12%" }}>
              <ChoiceChip
                option={{ label: day.short, value: String(day.value) }}
                selected={active}
                onPress={() => toggle(day.value)}
                size="comfortable"
                equal
                accessibilityRole="checkbox"
                accessibilityLabelPrefix={day.label}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}
