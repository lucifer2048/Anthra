import { Text, useWindowDimensions, View } from "react-native";
import { Check, MonitorCog, Moon, Sun, type LucideIcon } from "lucide-react-native";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import { useAnthraTheme, useThemeMode, type ThemeMode } from "../design-system";
import { AnimatedPressable } from "./ui";

const APPEARANCE_OPTIONS = [
  { mode: "system", label: "Auto", Icon: MonitorCog },
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon }
] as const;

function AppearanceOptionCard({
  label,
  Icon,
  selected,
  index,
  onSelect
}: {
  label: string;
  Icon: LucideIcon;
  selected: boolean;
  index: number;
  onSelect: () => void;
}) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.delay(80 + index * 60).springify().damping(18).stiffness(220)}
      style={{ flex: 1 }}
    >
      <Animated.View style={{ width: "100%" }}>
      <AnimatedPressable
        onPress={onSelect}
        haptic="selection"
        pressScale="icon"
        accessibilityRole="radio"
        accessibilityLabel={`${label} appearance`}
        accessibilityState={{ selected, checked: selected }}
        style={({ pressed }) => ({
          minHeight: 104,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderBottomWidth: 3,
          borderColor: selected ? theme.colors.brand : theme.colors.border,
          borderBottomColor: selected ? theme.colors.brandPressed : theme.colors.borderStrong,
          backgroundColor: pressed
            ? theme.colors.surfacePressed
            : selected
              ? theme.colors.brandSoft
              : theme.colors.surfaceSubtle
        })}
      >
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: theme.radii.full,
            backgroundColor: theme.colors.surface
          }}
        >
          <Icon accessible={false} color={selected ? theme.colors.brand : theme.colors.textSecondary} size={21} />
          {selected && (
            <View
              style={{ position: "absolute", right: -4, top: -4, alignItems: "center", justifyContent: "center", width: 17, height: 17, borderRadius: 9, backgroundColor: theme.colors.brandSolid }}
            >
              <Check accessible={false} color={theme.colors.textOnBrandSolid} size={11} strokeWidth={3} />
            </View>
          )}
        </View>
        <Text style={[theme.typography.label, { color: selected ? theme.colors.brand : theme.colors.textSecondary }]}>{label}</Text>
      </AnimatedPressable>
      </Animated.View>
    </Animated.View>
  );
}

export function AppearanceControl() {
  const theme = useAnthraTheme();
  const { mode, setMode } = useThemeMode();
  const { fontScale, width } = useWindowDimensions();
  const stackCards = width < 330 || fontScale >= 1.45;

  return (
    <View>
      <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>Appearance</Text>
      <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>Choose how Anthra looks on this device.</Text>
      <View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: stackCards ? "column" : "row",
          gap: theme.spacing.sm,
          marginTop: theme.spacing.lg,
        }}
      >
        {APPEARANCE_OPTIONS.map(({ mode: optionMode, label, Icon }, index) => (
          <AppearanceOptionCard
            key={optionMode}
            label={label}
            Icon={Icon}
            selected={mode === optionMode}
            index={index}
            onSelect={() => setMode(optionMode as ThemeMode)}
          />
        ))}
      </View>
    </View>
  );
}
