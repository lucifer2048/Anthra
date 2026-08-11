import { Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
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
  className?: string;
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
  className,
  divider = false
}: ScreenHeaderProps) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const stackAction = Boolean(action) && (width < 360 || fontScale >= 1.4);

  return (
    <View
      className={`w-full ${stackAction ? "flex-col items-stretch" : "flex-row items-center"} ${className ?? ""}`}
      style={[{ gap: theme.spacing.md, paddingVertical: theme.spacing.lg, borderBottomWidth: divider ? theme.borderWidths.standard : 0, borderBottomColor: theme.colors.divider }, style]}
    >
      <View className="w-full min-w-0 flex-1 flex-row items-center" style={{ gap: theme.spacing.md }}>
        {onBack && (
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel={backLabel}
            onPress={onBack}
            variant="ghost"
          />
        )}

        <View className="min-w-0 flex-1">
          {eyebrow && (
            <Text numberOfLines={1} style={[theme.typography.label, { color: theme.colors.brand, marginBottom: theme.spacing.xs }]}>
              {eyebrow}
            </Text>
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

        {!stackAction && action ? (
          <View style={{ flexShrink: 0, maxWidth: "42%", minHeight: theme.layout.minTouchTarget, justifyContent: "center", alignItems: "flex-end" }}>
            {action}
          </View>
        ) : null}
      </View>

      {stackAction && action ? (
        <View style={{ minHeight: theme.layout.minTouchTarget, justifyContent: "center", alignItems: "stretch" }}>
          {action}
        </View>
      ) : null}
    </View>
  );
}
