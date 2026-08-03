import { ActivityIndicator, Animated, Image, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAnthraTheme } from "../design-system";

type LaunchOverlayProps = {
  opacity: Animated.Value;
};

export function LaunchOverlay({ opacity }: LaunchOverlayProps) {
  const theme = useAnthraTheme();

  return (
    <Animated.View
      pointerEvents="auto"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity }}
    >
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: theme.colors.canvas }}>
        <StatusBar style={theme.statusBarStyle} backgroundColor={theme.colors.canvas} translucent={false} />
        <View
          className="w-full max-w-[360px] rounded-3xl border px-8 py-10"
          style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }}
        >
          <View className="items-center">
            <Image source={require("../../assets/icons/icon-red.png")} className="h-24 w-24 rounded-3xl" resizeMode="cover" />
            <Text className="mt-5 text-4xl font-black tracking-[4px]" style={{ color: theme.colors.brand, textAlign: "center" }}>ANTHRA</Text>
            <Text className="mt-2 text-sm font-semibold uppercase tracking-[2px]" style={{ color: theme.colors.textSecondary, textAlign: "center" }}>
              Your day, thoughtfully organized
            </Text>
            <View className="mt-8 items-center">
              <ActivityIndicator size="large" color={theme.colors.brand} />
              <Text className="mt-4 text-xs font-semibold uppercase tracking-[1.5px]" style={{ color: theme.colors.textTertiary }}>
                Loading your space…
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
