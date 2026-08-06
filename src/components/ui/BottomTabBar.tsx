import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";

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
        backgroundColor: theme.colors.surface
      }}
    >
      <View
        className="flex-row"
        style={{
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
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole="tab"
              accessibilityLabel={`${label} tab`}
              accessibilityState={{ selected: active }}
              accessibilityHint={`${accessibilityHintPrefix} ${label.toLowerCase()}`}
              className="flex-1 items-center justify-center"
              style={({ pressed }) => ({
                minHeight: compact ? 50 : 58,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radii.md,
                backgroundColor: active
                  ? theme.colors.brandSoft
                  : pressed
                    ? theme.colors.surfacePressed
                    : "transparent",
                opacity: pressed ? 0.82 : 1
              })}
            >
              <Icon accessible={false} size={20} color={color} strokeWidth={active ? 2.5 : 2} />
              {!compact && (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  maxFontSizeMultiplier={1.2}
                  style={[
                    theme.typography.caption,
                    { color, fontWeight: active ? "600" : "400", marginTop: 3 }
                  ]}
                >
                  {label}
                </Text>
              )}
            </Pressable>
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
