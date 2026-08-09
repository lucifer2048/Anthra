import { useState } from "react";
import { Platform, Text, View, type StyleProp, type ViewStyle } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { CalendarDays } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";
import { Button } from "./Button";

export type DatePickerFieldProps = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  error?: string;
  style?: StyleProp<ViewStyle>;
};

export function DatePickerField({ label, value, onChange, minimumDate, maximumDate, disabled = false, error, style }: DatePickerFieldProps) {
  const theme = useAnthraTheme();
  const [open, setOpen] = useState(false);
  const handleChange = (event: DateTimePickerEvent, next?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "set" && next) onChange(next);
  };

  return (
    <View style={style}>
      <Text style={[theme.typography.label, { color: error ? theme.colors.danger : theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>{label}</Text>
      <AnimatedPressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        haptic="selection"
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value.toLocaleDateString()}`}
        accessibilityState={{ disabled, expanded: open }}
      >
        <View style={{ minHeight: theme.sizes.control.large, paddingHorizontal: theme.spacing.lg, flexDirection: "row", alignItems: "center", gap: theme.spacing.md, borderRadius: theme.radii.lg, borderWidth: theme.borderWidths.standard, borderColor: error ? theme.colors.danger : theme.colors.borderStrong, backgroundColor: disabled ? theme.colors.disabledSurface : theme.colors.surfaceSubtle, opacity: disabled ? theme.motion.disabledOpacity : 1 }}>
          <CalendarDays accessible={false} size={theme.sizes.icon.md} color={disabled ? theme.colors.disabledText : theme.colors.textSecondary} />
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[theme.typography.bodyLarge, { flex: 1, color: disabled ? theme.colors.disabledText : theme.colors.textPrimary }]}>{value.toLocaleDateString()}</Text>
        </View>
      </AnimatedPressable>
      {error ? <Text accessibilityRole="alert" style={[theme.typography.caption, { color: theme.colors.danger, marginTop: theme.spacing.xs }]}>{error}</Text> : null}
      {open ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <DateTimePicker value={value} mode="date" display={Platform.OS === "ios" ? "inline" : "default"} minimumDate={minimumDate} maximumDate={maximumDate} onChange={handleChange} themeVariant={theme.mode} accentColor={theme.colors.brand} textColor={theme.colors.textPrimary} />
          {Platform.OS === "ios" ? <Button label="Done" onPress={() => setOpen(false)} fullWidth style={{ marginTop: theme.spacing.sm }} /> : null}
        </View>
      ) : null}
    </View>
  );
}
