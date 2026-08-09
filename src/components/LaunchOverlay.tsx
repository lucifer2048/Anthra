import { Animated, Image, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAnthraTheme } from "../design-system";
import { SkeletonBlock } from "./ui";

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
          style={[theme.shadows.medium, { width: "100%", maxWidth: 360, borderRadius: theme.radii["2xl"], borderWidth: theme.borderWidths.standard, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated, paddingHorizontal: theme.spacing["3xl"], paddingVertical: theme.spacing["4xl"] }]}
        >
          <View className="items-center">
            <Image source={require("../../assets/icons/icon-red.png")} style={{ width: 96, height: 96, borderRadius: theme.radii["2xl"] }} resizeMode="cover" />
            <Text style={[theme.typography.display, { color: theme.colors.brand, textAlign: "center", marginTop: theme.spacing.xl }]}>ANTHRA</Text>
            <Text style={[theme.typography.eyebrow, { color: theme.colors.textSecondary, textAlign: "center", marginTop: theme.spacing.sm }]}>
              Your day, thoughtfully organized
            </Text>
            <View style={{ width: "100%", alignItems: "center", marginTop: theme.spacing["3xl"] }}>
              <SkeletonBlock width="72%" height={theme.spacing.sm} radius={theme.radii.full} />
              <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: theme.spacing.lg }]}>
                Loading your space…
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
