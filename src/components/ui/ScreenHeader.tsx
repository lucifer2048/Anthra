import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { useAnthraTheme } from "../../design-system";
import { IconButton } from "./IconButton";

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  backLabel?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  divider?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  backLabel = "Go back",
  action,
  style,
  divider = false
}: ScreenHeaderProps) {
  const theme = useAnthraTheme();

  return (
    <View
      style={[{ width: "100%", flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.lg, borderBottomWidth: divider ? theme.borderWidths.standard : 0, borderBottomColor: theme.colors.divider }, style]}
    >
      {onBack && (
        <IconButton
          icon={ArrowLeft}
          accessibilityLabel={backLabel}
          onPress={onBack}
          variant="outline"
          style={{ borderRadius: theme.radii.lg }}
        />
      )}

      <View style={{ minWidth: 0, flex: 1 }}>
        {eyebrow && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.xs, marginBottom: theme.spacing.xs }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.brand }} />
            <Text style={[theme.typography.eyebrow, { color: theme.colors.brand, letterSpacing: 0.8 }]}>
              {eyebrow.toUpperCase()}
            </Text>
          </View>
        )}
        <Text accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={1.4} style={[theme.typography.titleLarge, { color: theme.colors.textPrimary }]}>
          {title}
        </Text>
        {subtitle && (
          <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
            {subtitle}
          </Text>
        )}
      </View>

      {action && <View style={{ minHeight: theme.layout.minTouchTarget, justifyContent: "center" }}>{action}</View>}
    </View>
  );
}
