import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Star } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";

export function RatingControl({
  label = "Rating",
  value,
  onChange,
  maximum = 5,
  disabled = false,
  style
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  maximum?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={style}>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
        {Array.from({ length: maximum }, (_, index) => index + 1).map((rating) => {
          const selected = rating <= value;
          return (
            <AnimatedPressable key={rating} onPress={() => onChange(rating)} disabled={disabled} haptic="selection" pressScale="icon" accessibilityRole="radio" accessibilityLabel={`${rating} out of ${maximum}`} accessibilityState={{ selected: rating === value, checked: rating === value, disabled }}>
              <View style={{ width: theme.sizes.control.compact, height: theme.sizes.control.compact, alignItems: "center", justifyContent: "center" }}>
                <Star accessible={false} size={theme.sizes.icon.xl} color={selected ? theme.colors.brand : theme.colors.borderStrong} fill={selected ? theme.colors.brand : "transparent"} />
              </View>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}
