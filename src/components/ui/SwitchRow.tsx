import { Pressable, Switch, Text, View, type PressableProps } from "react-native";

import { useAnthraTheme } from "../../design-system";

export type SwitchRowProps = Omit<PressableProps, "children" | "onPress"> & {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  accessibilityState,
  style,
  ...props
}: SwitchRowProps) {
  const theme = useAnthraTheme();
  const isDisabled = disabled === true;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, checked: value, disabled: isDisabled }}
      style={(state) => [
        {
          width: "100%",
          minHeight: 72,
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: value ? theme.colors.brandBorder : theme.colors.borderStrong,
          backgroundColor: state.pressed
            ? theme.colors.surfacePressed
            : value
              ? theme.colors.brandSoft
              : theme.colors.surfaceSubtle,
          opacity: isDisabled ? theme.motion.disabledOpacity : 1
        },
        typeof style === "function" ? style(state) : style
      ]}
    >
      <View
        style={{
          flex: 1,
          minWidth: 0
        }}
      >
        <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>{label}</Text>
        {description && (
          <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
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
    </Pressable>
  );
}
