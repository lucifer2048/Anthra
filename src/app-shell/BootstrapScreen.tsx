import { Text } from "react-native";

import { ScreenLayout } from "../components/layout";
import { BlockingLoadingState, Button, Card } from "../components/ui";
import { createScreenBackgrounds, resolveTheme, themes } from "../design-system";
import { useAppShell } from "./AppShellContext";

export function BootstrapScreen() {
  const { bootstrapError, bootstrapAttempt, setBootstrapAttempt, themeMode, systemColorScheme } = useAppShell();
  const semanticTheme = resolveTheme(themeMode, systemColorScheme);
  const screenBackgrounds = createScreenBackgrounds(semanticTheme.colors);
  const workoutTheme = {
    accent: semanticTheme.colors.brand
  };
  const textPrimary = semanticTheme.colors.textPrimary;
  const textMuted = semanticTheme.colors.textSecondary;

  return (
    <ScreenLayout
      {...screenBackgrounds.canvas}
      safeAreaEdges={["top", "bottom"]}
      contentStyle={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
    >
      {bootstrapError ? (
        <Card
          accessibilityRole="alert"
          variant="elevated"
          elevation="overlay"
          padding="large"
          style={{ width: "100%", maxWidth: 440 }}
        >
          <Text style={[semanticTheme.typography.eyebrow, { color: workoutTheme.accent }]}>ANTHRA</Text>
          <Text
            accessibilityRole="header"
            style={[semanticTheme.typography.titleLarge, { color: textPrimary, marginTop: semanticTheme.spacing.md }]}
          >
            We couldn’t finish starting the app
          </Text>
          <Text style={[semanticTheme.typography.bodyLarge, { color: textMuted, marginTop: semanticTheme.spacing.sm }]}>
            Your data has not been changed. Retry the startup checks, or restart the app if the problem continues.
          </Text>
          <Text selectable style={[semanticTheme.typography.caption, { color: textMuted, marginTop: semanticTheme.spacing.md }]}>
            {bootstrapError}
          </Text>
          <Button
            label="Retry"
            onPress={() => setBootstrapAttempt((attempt) => attempt + 1)}
            accessibilityLabel="Retry starting Anthra"
            fullWidth
            style={{ marginTop: semanticTheme.spacing.xl }}
          />
        </Card>
      ) : (
        <BlockingLoadingState title="Starting Anthra" message="Preparing your private workspace…" />
      )}
    </ScreenLayout>
  );
}
