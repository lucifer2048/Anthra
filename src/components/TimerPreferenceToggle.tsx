import { Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../design-system";
import { AnimatedPressable } from "./ui";

export function TimerPreferenceToggle({ label, enabled, onChange, enabledIcon: EnabledIcon, disabledIcon: DisabledIcon, accent, accentSurface, width }: { label: string; enabled: boolean; onChange: (enabled: boolean) => void; enabledIcon: LucideIcon; disabledIcon: LucideIcon; accent: string; accentSurface: string; width: number }) {
  const theme = useAnthraTheme();
  return (
    <AnimatedPressable onPress={() => onChange(!enabled)} haptic="none" accessibilityRole="switch" accessibilityState={{ checked: enabled }} accessibilityLabel={`Workout ${label.toLowerCase()}`} style={({ pressed }) => ({ width, minHeight: theme.sizes.control.regular, gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, flexDirection: "row", alignItems: "center", borderRadius: theme.radii.full, borderWidth: theme.borderWidths.standard, borderColor: enabled ? theme.colors.brandBorder : theme.colors.border, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated })}>
      <View style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.full, backgroundColor: enabled ? accentSurface : theme.colors.surfaceSubtle }}>
        {enabled ? <EnabledIcon accessible={false} color={accent} size={theme.sizes.icon.sm} /> : <DisabledIcon accessible={false} color={theme.colors.textSecondary} size={theme.sizes.icon.sm} />}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68} maxFontSizeMultiplier={1.3} style={[theme.typography.label, { minWidth: 0, flex: 1, color: theme.colors.textPrimary }]}>{label}</Text>
    </AnimatedPressable>
  );
}
