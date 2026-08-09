import { Text, View, type StyleProp, type ViewStyle } from "react-native";
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
  disabled = false
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
      className={`items-center justify-center ${equal ? "flex-1" : ""}`}
      style={({ pressed }) => ({
        minHeight,
        minWidth: equal ? 0 : 58,
        flexGrow: equal ? 1 : 0,
        flexShrink: equal ? 1 : 0,
        flexBasis: equal ? 0 : "auto",
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.xs,
        flexDirection: Icon ? "row" : "column",
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: selected
          ? theme.colors.brand
          : theme.colors.borderStrong,
        backgroundColor: selected
          ? theme.colors.brandSoft
          : pressed
            ? theme.colors.surfacePressed
            : card
              ? theme.colors.surfaceSubtle
              : theme.colors.surface,
        opacity: disabled || option.disabled ? theme.motion.disabledOpacity : 1
      })}
    >
      {Icon ? (
        <Icon accessible={false} color={selected ? theme.colors.brand : theme.colors.textSecondary} size={16} />
      ) : null}
      <Text
        numberOfLines={card ? 2 : 1}
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
        className={layout === "equal" ? "flex-row" : "flex-row flex-wrap"}
        style={{ gap: theme.spacing.sm }}
      >
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            option={option}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            size={size}
            variant={variant}
            equal={layout === "equal"}
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
