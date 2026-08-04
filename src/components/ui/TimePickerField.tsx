import { useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Clock3 } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { Button } from "./Button";
import { ChoiceRow } from "./ChoiceRow";

type TimePickerFieldProps = {
  label: string;
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
  /** @deprecated Time fields now resolve colors from Anthra's semantic theme. */
  accentColor?: string;
  /** @deprecated Time fields now resolve colors from Anthra's semantic theme. */
  borderColor?: string;
  /** @deprecated Time fields now resolve colors from Anthra's semantic theme. */
  backgroundColor?: string;
  /** @deprecated Time fields now resolve colors from Anthra's semantic theme. */
  textColor?: string;
  /** @deprecated Time fields now resolve colors from Anthra's semantic theme. */
  mutedColor?: string;
  presets?: Array<{ label: string; hour: number; minute: number }>;
  emphasized?: boolean;
};

function formatTime(hour: number, minute: number): string {
  const date = new Date(2020, 0, 1, hour, minute);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function presetValue(hour: number, minute: number): string {
  return `${hour}:${minute}`;
}

export function TimePickerField({
  label,
  hour,
  minute,
  onChange,
  presets = [],
  emphasized = false
}: TimePickerFieldProps) {
  const theme = useAnthraTheme();
  const [open, setOpen] = useState(false);
  const value = useMemo(() => new Date(2020, 0, 1, hour, minute), [hour, minute]);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed" || !selected) return;
    onChange(selected.getHours(), selected.getMinutes());
  };

  return (
    <View>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatTime(hour, minute)}`}
        accessibilityHint="Opens the time picker"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center"
        style={({ pressed }) => ({
          minHeight: 56,
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radii.md,
          borderWidth: open || emphasized ? 2 : 1,
          borderColor: open ? theme.colors.focusRing : theme.colors.borderStrong,
          backgroundColor: pressed
            ? theme.colors.surfacePressed
            : emphasized
              ? theme.colors.surfaceElevated
              : theme.colors.surface
        })}
      >
        <View
          className="items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: theme.radii.full, backgroundColor: theme.colors.brandSoft }}
        >
          <Clock3 accessible={false} color={theme.colors.brand} size={19} />
        </View>
        <Text style={[theme.typography.titleMedium, { color: theme.colors.textPrimary, flex: 1 }]}>
          {formatTime(hour, minute)}
        </Text>
        <Text style={[theme.typography.label, { color: theme.colors.brand }]}>Change</Text>
      </Pressable>

      {presets.length > 0 && (
        <ChoiceRow
          options={presets.map((preset) => ({
            label: preset.label,
            value: presetValue(preset.hour, preset.minute)
          }))}
          value={presetValue(hour, minute)}
          onChange={(next) => {
            const [nextHour, nextMinute] = next.split(":").map(Number);
            onChange(nextHour, nextMinute);
          }}
          size="compact"
          style={{ marginTop: theme.spacing.sm }}
        />
      )}

      {open && (
        <View
          style={Platform.OS === "ios"
            ? {
                marginTop: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radii.lg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated
              }
            : undefined}
        >
          <DateTimePicker
            value={value}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleChange}
            themeVariant={theme.mode}
            accentColor={theme.colors.brand}
            textColor={theme.colors.textPrimary}
          />
          {Platform.OS === "ios" && (
            <Button
              label="Done"
              onPress={() => setOpen(false)}
              fullWidth
              style={{ marginTop: theme.spacing.sm }}
            />
          )}
        </View>
      )}
    </View>
  );
}
