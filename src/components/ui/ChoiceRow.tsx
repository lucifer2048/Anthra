import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";

export type ChoiceOption<T extends string = string> = {
  label: string;
  value: T;
  icon?: LucideIcon;
  disabled?: boolean;
};

export type ChoiceRowProps<T extends string = string> = {
  label?: string;
  options: Array<ChoiceOption<T>>;
  value?: T;
  onChange: (value: T) => void;
  layout?: "wrap" | "equal";
  size?: "compact" | "comfortable";
  variant?: "chip" | "card";
  disabled?: boolean;
  error?: string;
  style?: StyleProp<ViewStyle>;
};

export function ChoiceChip<T extends string = string>({
  option,
  selected,
  onPress,
  size = "comfortable",
  variant = "chip",
  equal = false,
  accessibilityLabelPrefix,
  accessibilityRole = "radio",
  disabled = false,
  fullWidth = false
}: {
  option: ChoiceOption<T>;
  selected: boolean;
  onPress: () => void;
  size?: "compact" | "comfortable";
  variant?: "chip" | "card";
  equal?: boolean;
  accessibilityLabelPrefix?: string;
  accessibilityRole?: "radio" | "checkbox" | "button";
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const theme = useAnthraTheme();
  const Icon = option.icon;
  const card = variant === "card";
  const minHeight = size === "compact"
    ? theme.layout.compactTouchTarget
    : theme.layout.minTouchTarget;

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || option.disabled}
      haptic="selection"
      accessibilityRole={accessibilityRole}
      accessibilityLabel={
        accessibilityLabelPrefix ? `${accessibilityLabelPrefix}, ${option.label}` : option.label
      }
      accessibilityState={{ checked: selected, selected, disabled: disabled || option.disabled }}
      style={({ pressed }) => ({
        alignItems: "center",
        justifyContent: "center",
        minHeight,
        minWidth: equal || fullWidth ? 0 : 58,
        width: fullWidth ? "100%" : undefined,
        flexGrow: equal ? 1 : 0,
        flexShrink: equal || fullWidth ? 1 : 0,
        flexBasis: equal ? 0 : "auto",
        paddingHorizontal: size === "compact" ? theme.spacing.sm : theme.spacing.lg,
        paddingVertical: size === "compact" ? theme.spacing.xs : theme.spacing.sm,
        gap: theme.spacing.xs,
        flexDirection: Icon ? "row" : "column",
        borderRadius: theme.radii.lg,
        borderWidth: 1.5,
        borderColor: selected
          ? theme.colors.brandBorder
          : theme.colors.borderStrong,
        backgroundColor: selected
          ? theme.colors.brandSoft
          : pressed
            ? theme.colors.surfacePressed
            : theme.colors.surfaceElevated,
        opacity: disabled || option.disabled ? theme.motion.disabledOpacity : 1,
        ...(selected ? theme.shadows.low : {})
      })}
    >
      {Icon ? (
        <Icon accessible={false} color={selected ? theme.colors.brand : theme.colors.textSecondary} size={16} />
      ) : null}
      <Text
        numberOfLines={card ? 2 : 1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={1.4}
        style={[
          card
            ? theme.typography.label
            : size === "compact"
              ? theme.typography.label
              : theme.typography.labelLarge,
          {
            minWidth: 0,
            flexShrink: 1,
            color: selected
              ? theme.colors.brand
              : card
                ? theme.colors.textSecondary
                : theme.colors.textPrimary,
            textAlign: "center",
            textTransform: "none"
          }
        ]}
      >
        {option.label}
      </Text>
    </AnimatedPressable>
  );
}

export function ChoiceRow<T extends string = string>({
  label,
  options,
  value,
  onChange,
  layout = "wrap",
  size = "comfortable",
  variant = "chip",
  disabled = false,
  error,
  style
}: ChoiceRowProps<T>) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const shouldStackEqualOptions = layout === "equal"
    && options.length > 2
    && (fontScale >= 1.25 || (width < 440 && options.some((option) => option.label.length > 7)));

  return (
    <View style={[{ marginTop: label ? theme.spacing.md : 0 }, style]}>
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
          gap: theme.spacing.sm,
          flexDirection: shouldStackEqualOptions ? "column" : "row",
          flexWrap: (!shouldStackEqualOptions && layout !== "equal") ? "wrap" : undefined
        }}
      >
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            option={option}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            size={size}
            variant={variant}
            equal={layout === "equal" && !shouldStackEqualOptions}
            fullWidth={shouldStackEqualOptions}
            accessibilityLabelPrefix={label}
            disabled={disabled}
          />
        ))}
      </View>
      {error ? <Text accessibilityRole="alert" style={[theme.typography.caption, { color: theme.colors.danger, marginTop: theme.spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

/** @deprecated Use ChoiceRow */
export type QuickChoice = ChoiceOption<string>;

/** @deprecated Use ChoiceRow */
export function QuickChoiceRow({
  label,
  choices,
  selectedValue,
  onSelect
}: {
  label: string;
  choices: QuickChoice[];
  selectedValue?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ChoiceRow
      label={label}
      options={choices}
      value={selectedValue}
      onChange={onSelect}
    />
  );
}
