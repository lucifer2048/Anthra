import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import type { ScreenBackgroundToken } from "../../design-system/backgrounds";
import { BackgroundLayer } from "./BackgroundLayer";

export type SafeAreaEdge = Edge;

export type ScreenLayoutProps = ScreenBackgroundToken & {
  children: React.ReactNode;
  /**
   * Which edges receive safe-area padding. Default: all four.
   * Drop `"top"` for edge-to-edge covers; drop `"bottom"` when a tab bar owns the inset.
   */
  safeAreaEdges?: SafeAreaEdge[];
  /** Solid fill on the safe-area content wrapper (defaults transparent so background shows). */
  safeAreaColor?: string;
  /** Optional per-edge band colors under the padded regions. */
  safeAreaEdgeColors?: Partial<Record<SafeAreaEdge, string>>;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * When a root top banner is visible (OTA, etc.), drop the top safe edge
   * so content does not double-gap under the banner.
   */
  rootTopBannerVisible?: boolean;
  statusBarStyle?: "light" | "dark" | "auto";
};

/**
 * Shared wrapper every screen must use.
 *
 * ```
 * ScreenLayout
 *  ├── BackgroundLayer   (full screen: color / gradient / image)
 *  └── SafeAreaView      (content only)
 *       └── your screen UI
 * ```
 */
export function ScreenLayout({
  children,
  color,
  gradient,
  image,
  imageResizeMode,
  withBgCircle,
  circleColor,
  safeAreaEdges,
  safeAreaColor = "transparent",
  safeAreaEdgeColors,
  style,
  contentStyle,
  rootTopBannerVisible = false,
  statusBarStyle
}: ScreenLayoutProps) {
  const theme = useAnthraTheme();
  const resolvedColor = color ?? theme.colors.canvas;

  const baseEdges: SafeAreaEdge[] =
    safeAreaEdges ?? (["top", "right", "bottom", "left"] as SafeAreaEdge[]);
  const edges = rootTopBannerVisible ? baseEdges.filter((edge) => edge !== "top") : baseEdges;

  const hasEdgeColors = Boolean(safeAreaEdgeColors && Object.keys(safeAreaEdgeColors).length > 0);
  const resolvedSafeColor = hasEdgeColors
    ? safeAreaColor === "transparent"
      ? resolvedColor
      : safeAreaColor
    : safeAreaColor;

  return (
    <View style={[styles.root, style]}>
      <BackgroundLayer
        color={resolvedColor}
        gradient={gradient}
        image={image}
        imageResizeMode={imageResizeMode}
        withBgCircle={withBgCircle}
        circleColor={circleColor}
      />

      <StatusBar
        style={statusBarStyle ?? theme.statusBarStyle}
        backgroundColor="transparent"
        translucent
      />

      <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: resolvedSafeColor }, contentStyle]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

export { useScreenBackgrounds } from "./useScreenBackgrounds";

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  safe: {
    flex: 1
  }
});

export default ScreenLayout;
