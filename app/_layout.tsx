import "../global.css";
import "../src/utils/reminderNotificationTask";

import { Stack } from "expo-router";
import { View } from "react-native";

import { AppShellChrome, AppShellProvider } from "../src/app-shell/AppShellProvider";
import { BootstrapScreen } from "../src/app-shell/BootstrapScreen";
import { useAppShell } from "../src/app-shell/AppShellContext";
import { AccountOnboardingGate } from "../src/features/account";
import { AppProviders } from "../src/providers";

function AppShellLayout() {
  const { ready, themeMode, handleThemeModeChange, appBackground } = useAppShell();

  return (
    <AppProviders
      themeMode={themeMode}
      onThemeModeChange={handleThemeModeChange}
      localDataReady={ready}
    >
      <AccountOnboardingGate>
        <View className="flex-1" style={{ flex: 1, backgroundColor: appBackground }}>
          {!ready ? (
            <BootstrapScreen />
          ) : (
            <>
              <Stack
                screenOptions={{
                  headerShown: false,
                  gestureEnabled: true,
                  fullScreenGestureEnabled: true,
                  animation: "slide_from_right",
                  contentStyle: { backgroundColor: appBackground }
                }}
              >
                <Stack.Screen name="index" options={{ gestureEnabled: false }} />
                <Stack.Screen name="timer" options={{ gestureEnabled: false, animation: "fade" }} />
              </Stack>
              <AppShellChrome />
            </>
          )}
        </View>
      </AccountOnboardingGate>
    </AppProviders>
  );
}

export default function RootLayout() {
  return (
    <AppShellProvider>
      <AppShellLayout />
    </AppShellProvider>
  );
}
