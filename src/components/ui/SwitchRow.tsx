import { Switch, Text, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { useAnthraTheme } from "../../design-system";

export type SwitchRowProps = ViewProps & {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  leadingIcon?: LucideIcon;
  emphasized?: boolean;
  showStateLabel?: boolean;
  appearance?: "card" | "embedded";
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
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
  style,
  ...props
}: SwitchRowProps) {
  const theme = useAnthraTheme();
  const isDisabled = disabled === true;
  const embedded = appearance === "embedded";

  return (
    <View
      {...props}
      style={[
        {
          width: "100%",
          minHeight: LeadingIcon ? 88 : embedded ? 64 : 72,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          paddingHorizontal: embedded ? 0 : theme.spacing.lg,
          paddingVertical: emphasized ? theme.spacing.lg : theme.spacing.md,
          borderRadius: embedded ? theme.radii.md : theme.radii.xl,
          borderWidth: embedded ? 0 : 1.5,
          borderColor: isDisabled
            ? theme.colors.border
            : value
              ? theme.colors.brandBorder
              : theme.colors.borderStrong,
          backgroundColor: embedded
            ? "transparent"
            : isDisabled
            ? theme.colors.disabledSurface
            : value
              ? theme.colors.brandSoft
              : theme.colors.surfaceElevated,
          ...(!embedded ? theme.shadows.low : theme.shadows.none)
        },
        style
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
          {showStateLabel ? (
            <View
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
            </View>
          ) : null}
        </View>
        {description && (
          <Text style={[theme.typography.caption, { color: isDisabled ? theme.colors.disabledText : theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
            {description}
          </Text>
        )}
      </View>
      <View
        style={{
          flexGrow: 0,
          flexShrink: 0,
          alignSelf: "center",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <Switch
          accessibilityLabel={accessibilityLabel ?? label}
          value={value}
          onValueChange={onValueChange}
          disabled={isDisabled}
          trackColor={{ false: theme.colors.borderStrong, true: theme.colors.brandBorder }}
          thumbColor={value ? theme.colors.brandSolid : theme.colors.textTertiary}
          ios_backgroundColor={theme.colors.borderStrong}
        />
      </View>
    </View>
  );
}
