import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, type ThemeMode } from "../design-system";

export type AppProvidersProps = {
  children: ReactNode;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
};

/**
 * Root provider tree for Anthra.
 *
 * Order (outer → inner):
 * 1. GestureHandlerRootView — gesture system
 * 2. SafeAreaProvider — inset metrics (not padding)
 * 3. ThemeProvider — semantic tokens + NativeWind dark sync
 *
 * Add future app-wide providers here (e.g. QueryClientProvider if remote APIs appear).
 * Do NOT wrap SafeAreaView or ScreenLayout here — screens own that via ScreenLayout.
 */
export function AppProviders({ children, themeMode, onThemeModeChange }: AppProvidersProps) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider mode={themeMode} onModeChange={onThemeModeChange}>
          {children}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  }
});
