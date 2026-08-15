import type { LucideIcon } from "lucide-react-native";
import { Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";

export type BottomTabItem<T extends string = string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export type BottomTabBarProps<T extends string = string> = {
  tabs: Array<BottomTabItem<T>>;
  activeTab: T;
  onChange: (tab: T) => void;
  /** Wrap in bottom safe area (Tracker uses this). */
  safeArea?: boolean;
  accessibilityHintPrefix?: string;
};

export function BottomTabBar<T extends string = string>({
  tabs,
  activeTab,
  onChange,
  safeArea = false,
  accessibilityHintPrefix = "Opens"
}: BottomTabBarProps<T>) {
  const theme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360 || fontScale >= 1.3;

  const bar = (
    <View
      style={{
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTopWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
        ...theme.shadows.medium
      }}
    >
      <View
        style={{
          flexDirection: "row",
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          gap: theme.spacing.xs
        }}
      >
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          const color = active ? theme.colors.brand : theme.colors.textSecondary;
          return (
            <AnimatedPressable
              key={id}
              onPress={() => onChange(id)}
              haptic={active ? "none" : "selection"}
              pressScale="subtle"
              accessibilityRole="tab"
              accessibilityLabel={`${label} tab`}
              accessibilityState={{ selected: active }}
              accessibilityHint={`${accessibilityHintPrefix} ${label.toLowerCase()}`}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                minHeight: compact ? 50 : 58,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radii.xl,
                borderWidth: 1,
                borderColor: active
                  ? theme.isDark
                    ? theme.colors.brandBorder
                    : "rgba(0,0,0,0.08)"
                  : "transparent",
                backgroundColor: active
                  ? theme.isDark
                    ? theme.colors.brandSoft
                    : theme.colors.surface
                  : pressed
                    ? theme.colors.surfacePressed
                    : "transparent",
                opacity: pressed ? 0.82 : 1,
                ...(active && !theme.isDark ? { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 } : {})
              })}
            >
              <Icon accessible={false} size={20} color={color} strokeWidth={active ? 2.5 : 2} />
              {!compact ? (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  maxFontSizeMultiplier={1.2}
                  style={[theme.typography.caption, { color, fontWeight: active ? "700" : "600", marginTop: 3, letterSpacing: 0.1 }]}
                >
                  {label}
                </Text>
              ) : null}
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );

  if (!safeArea) return bar;

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{ width: "100%", alignSelf: "stretch", backgroundColor: theme.colors.surface }}
    >
      {bar}
    </SafeAreaView>
  );
}
