import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { Card } from "./Surface";

export function BlockingLoadingState({
  title = "Loading Anthra",
  message = "Getting everything ready…",
  fullScreen = false,
  style
}: {
  title?: string;
  message?: string;
  fullScreen?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const content = (
    <Card variant="elevated" padding="large" style={{ width: "100%", maxWidth: 420 }}>
      <View accessibilityLabel={`${title}. ${message}`} accessibilityState={{ busy: true }} style={{ alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
        <Text accessibilityRole="header" style={[theme.typography.titleMedium, { color: theme.colors.textPrimary, textAlign: "center", marginTop: theme.spacing.lg }]}>{title}</Text>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, textAlign: "center", marginTop: theme.spacing.sm }]}>{message}</Text>
      </View>
    </Card>
  );
  return (
    <View style={[{ flex: fullScreen ? 1 : undefined, width: "100%", alignItems: "center", justifyContent: "center", padding: theme.layout.screenPadding }, style]}>
      {content}
    </View>
  );
}
