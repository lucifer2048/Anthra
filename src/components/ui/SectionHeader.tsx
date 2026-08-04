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
      className="flex-row items-end justify-between"
      style={[{ gap: theme.spacing.md }, style]}
    >
      <View className="min-w-0 flex-1 flex-row items-center" style={{ gap: theme.spacing.sm }}>
        {Icon ? <Icon accessible={false} color={theme.colors.brand} size={20} /> : null}
        <Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, flexShrink: 1 }]}>
          {title}
        </Text>
      </View>
      {meta ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{meta}</Text>
      ) : null}
      {action}
    </View>
  );
}
