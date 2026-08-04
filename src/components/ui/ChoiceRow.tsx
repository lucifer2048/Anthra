import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";

export type ChoiceOption<T extends string = string> = {
  label: string;
  value: T;
  icon?: LucideIcon;
};

export type ChoiceRowProps<T extends string = string> = {
  label?: string;
  options: Array<ChoiceOption<T>>;
  value?: T;
  onChange: (value: T) => void;
  layout?: "wrap" | "equal";
  size?: "compact" | "comfortable";
  style?: StyleProp<ViewStyle>;
};

export function ChoiceChip<T extends string = string>({
  option,
  selected,
  onPress,
  size = "comfortable",
  equal = false,
  accessibilityLabelPrefix
}: {
  option: ChoiceOption<T>;
  selected: boolean;
  onPress: () => void;
  size?: "compact" | "comfortable";
  equal?: boolean;
  accessibilityLabelPrefix?: string;
}) {
  const theme = useAnthraTheme();
  const Icon = option.icon;
  const minHeight =
    size === "compact" ? theme.layout.compactTouchTarget : theme.layout.minTouchTarget;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={
        accessibilityLabelPrefix ? `${accessibilityLabelPrefix}, ${option.label}` : option.label
      }
      accessibilityState={{ checked: selected, selected }}
      className={`items-center justify-center ${equal ? "flex-1" : ""}`}
      style={({ pressed }) => ({
        minHeight,
        minWidth: equal ? undefined : 58,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.xs,
        flexDirection: Icon ? "row" : "column",
        borderRadius: theme.radii.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.brand : theme.colors.borderStrong,
        backgroundColor: selected
          ? theme.colors.brandSoft
          : pressed
            ? theme.colors.surfacePressed
            : theme.colors.surface,
        transform: [{ scale: pressed ? theme.motion.pressedScale : 1 }]
      })}
    >
      {Icon ? <Icon accessible={false} color={selected ? theme.colors.brand : theme.colors.textSecondary} size={16} /> : null}
      <Text
        style={[
          size === "compact" ? theme.typography.label : theme.typography.labelLarge,
          { color: selected ? theme.colors.brand : theme.colors.textPrimary }
        ]}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

export function ChoiceRow<T extends string = string>({
  label,
  options,
  value,
  onChange,
  layout = "wrap",
  size = "comfortable",
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
        className="flex-row flex-wrap"
        style={{ gap: theme.spacing.sm }}
      >
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            option={option}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            size={size}
            equal={layout === "equal"}
            accessibilityLabelPrefix={label}
          />
        ))}
      </View>
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
