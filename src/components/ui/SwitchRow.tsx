import { Switch, Text, View, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";

export type SwitchRowProps = Omit<PressableProps, "children" | "onPress"> & {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  leadingIcon?: LucideIcon;
  emphasized?: boolean;
  showStateLabel?: boolean;
  appearance?: "card" | "embedded";
};

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  leadingIcon: LeadingIcon,
  emphasized = false,
  showStateLabel = false,
  appearance = "card",
  disabled = false,
  accessibilityLabel,
  accessibilityState,
  style,
  ...props
}: SwitchRowProps) {
  const theme = useAnthraTheme();
  const isDisabled = disabled === true;
  const embedded = appearance === "embedded";

  return (
    <AnimatedPressable
      {...props}
      disabled={isDisabled}
      onPress={() => onValueChange(!value)}
      haptic="selection"
      pressScale="subtle"
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, checked: value, disabled: isDisabled }}
      style={(state) => [
        {
          width: "100%",
          minHeight: LeadingIcon ? 88 : embedded ? 64 : 72,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          paddingHorizontal: embedded ? 0 : theme.spacing.lg,
          paddingVertical: emphasized ? theme.spacing.lg : theme.spacing.md,
          borderRadius: embedded ? theme.radii.md : emphasized ? theme.radii.xl : theme.radii.lg,
          borderWidth: embedded ? 0 : theme.borderWidths.standard,
          borderColor: isDisabled
            ? theme.colors.border
            : value
              ? theme.colors.brand
              : emphasized
                ? theme.colors.brandBorder
                : theme.colors.borderStrong,
          backgroundColor: embedded && !state.pressed
            ? "transparent"
            : isDisabled
            ? theme.colors.disabledSurface
            : state.pressed
              ? theme.colors.surfacePressed
              : value
                ? theme.colors.brandSoft
                : emphasized
                  ? theme.colors.surfaceElevated
                  : theme.colors.surfaceSubtle,
          ...(emphasized && !embedded ? theme.shadows.medium : theme.shadows.none)
        },
        typeof style === "function" ? style(state) : style
      ]}
    >
      {LeadingIcon && (
        <View
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: theme.radii.lg,
            backgroundColor: isDisabled
              ? theme.colors.surfaceSubtle
              : value
                ? theme.colors.surfaceElevated
                : theme.colors.brandSoft
          }}
        >
          <LeadingIcon
            accessible={false}
            color={isDisabled ? theme.colors.disabledText : theme.colors.brand}
            size={22}
          />
        </View>
      )}
      <View
        style={{
          flex: 1,
          minWidth: 0
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <Text style={[theme.typography.bodyStrong, { flex: 1, color: isDisabled ? theme.colors.disabledText : theme.colors.textPrimary }]}>{label}</Text>
          {showStateLabel ? <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs,
              borderRadius: theme.radii.full,
              backgroundColor: isDisabled
                ? theme.colors.surfaceSubtle
                : value
                  ? theme.colors.surfaceElevated
                  : theme.colors.surfaceSubtle
            }}
          >
            <Text style={[theme.typography.caption, { color: isDisabled ? theme.colors.disabledText : value ? theme.colors.brand : theme.colors.textTertiary }]}>
              {isDisabled ? "LOCKED" : value ? "ON" : "OFF"}
            </Text>
          </View> : null}
        </View>
        {description && (
          <Text style={[theme.typography.caption, { color: isDisabled ? theme.colors.disabledText : theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
            {description}
          </Text>
        )}
      </View>
      <View
        pointerEvents="none"
        style={{
          flexGrow: 0,
          flexShrink: 0,
          alignSelf: "center",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Switch
          accessible={false}
          value={value}
          disabled={isDisabled}
          trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brandBorder }}
          thumbColor={value ? theme.colors.brandSolid : theme.colors.textTertiary}
          ios_backgroundColor={theme.colors.borderStrong}
        />
      </View>
    </AnimatedPressable>
  );
}
