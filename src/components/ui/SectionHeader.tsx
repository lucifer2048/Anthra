import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
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

  return (
    <View
      style={[{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: theme.spacing.md }, style]}
    >
      <View style={{ minWidth: 0, flex: 1, flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
        {Icon ? <Icon accessible={false} color={theme.colors.brand} size={20} /> : null}
        <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, flexShrink: 1 }]}>
          {title}
        </Text>
      </View>
      {meta ? (
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.3}
          style={[theme.typography.caption, { maxWidth: "45%", flexShrink: 1, color: theme.colors.textSecondary, textAlign: "right" }]}
        >
          {meta}
        </Text>
      ) : null}
      {action}
    </View>
  );
}
