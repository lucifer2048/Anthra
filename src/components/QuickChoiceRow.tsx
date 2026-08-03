import { Pressable, Text, View } from "react-native";
import { useAnthraTheme } from "../design-system";

export type QuickChoice = {
  label: string;
  value: string;
};

type QuickChoiceRowProps = {
  label: string;
  choices: QuickChoice[];
  selectedValue?: string;
  onSelect: (value: string) => void;
};

export function QuickChoiceRow({ label, choices, selectedValue, onSelect }: QuickChoiceRowProps) {
  const theme = useAnthraTheme();

  return (
    <View style={{ marginTop: theme.spacing.md }}>
      <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>
        {label}
      </Text>
      <View className="flex-row flex-wrap" style={{ gap: theme.spacing.sm }}>
        {choices.map((choice) => {
          const selected = choice.value === selectedValue;
          return (
            <Pressable
              key={choice.value}
              onPress={() => onSelect(choice.value)}
              accessibilityRole="radio"
              accessibilityLabel={`${label}, ${choice.label}`}
              accessibilityState={{ checked: selected, selected }}
              style={({ pressed }) => ({
                minHeight: theme.layout.minTouchTarget,
                minWidth: 64,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
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
              <Text style={[theme.typography.labelLarge, { color: selected ? theme.colors.brand : theme.colors.textPrimary }]}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
