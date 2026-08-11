import type { ReactNode } from "react";
import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";

export type SectionHeaderProps = {
  title: string;
  meta?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, meta, icon: Icon, action, style }: SectionHeaderProps) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale >= 1.4;

  return (
    <View
      className={stacked ? "flex-col items-stretch" : "flex-row items-end justify-between"}
      style={[{ gap: theme.spacing.md }, style]}
    >
      <View className="min-w-0 flex-1 flex-row items-center" style={{ gap: theme.spacing.sm }}>
        {Icon ? <Icon accessible={false} color={theme.colors.brand} size={20} /> : null}
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
          style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, flexShrink: 1, minWidth: 0 }]}
        >
          {title}
        </Text>
      </View>
      {meta || action ? (
        <View
          className={stacked ? "flex-row flex-wrap items-center" : "flex-row items-center"}
          style={{ gap: theme.spacing.sm, flexShrink: stacked ? undefined : 0, maxWidth: stacked ? "100%" : "48%" }}
        >
          {meta ? (
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
              style={[theme.typography.caption, { flexShrink: 1, minWidth: 0, color: theme.colors.textSecondary, textAlign: stacked ? "left" : "right" }]}
            >
              {meta}
            </Text>
          ) : null}
          {action ? <View style={{ flexShrink: 0 }}>{action}</View> : null}
        </View>
      ) : null}
    </View>
  );
}
