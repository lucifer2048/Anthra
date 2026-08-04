import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import { createScreenBackgrounds, type ScreenBackgroundToken } from "../../design-system/backgrounds";
import { BackgroundLayer } from "./BackgroundLayer";

export type SafeAreaEdge = Edge;

export type ScreenLayoutProps = ScreenBackgroundToken & {
  children: ReactNode;
  /**
   * Which edges receive safe-area padding. Default: all four.
   * Drop `"top"` for edge-to-edge covers; drop `"bottom"` when a tab bar owns the inset.
   */
  safeAreaEdges?: SafeAreaEdge[];
  /** Solid fill on the safe-area content wrapper (defaults transparent so background shows). */
  safeAreaColor?: string;
  /** Optional per-edge band colors (e.g. dark home-indicator strip). */
  safeAreaEdgeColors?: Partial<Record<SafeAreaEdge, string>>;
  /** Extra style on the outer full-screen container. */
  style?: StyleProp<ViewStyle>;
  /** Extra style on the safe-area content wrapper. */
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * When a root top banner is visible (OTA, etc.), drop the top safe edge
   * so content does not double-gap under the banner.
   */
  rootTopBannerVisible?: boolean;
  /** Override status bar style; defaults to theme. */
  statusBarStyle?: "light" | "dark" | "auto";
};

const ScreenLayoutContext = createContext<{ usingScreenLayout: boolean }>({ usingScreenLayout: false });

export function useScreenLayoutContext() {
  return useContext(ScreenLayoutContext);
}

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

  const edges = useMemo(() => {
    const base: SafeAreaEdge[] =
      safeAreaEdges ?? (["top", "right", "bottom", "left"] as SafeAreaEdge[]);
    if (rootTopBannerVisible) {
      return base.filter((edge) => edge !== "top");
    }
    return base;
  }, [safeAreaEdges, rootTopBannerVisible]);

  const contextValue = useMemo(() => ({ usingScreenLayout: true }), []);

  return (
    <ScreenLayoutContext.Provider value={contextValue}>
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

        {safeAreaEdgeColors?.top && edges.includes("top") === false ? (
          <View style={{ height: 0 }} />
        ) : null}

        <SafeAreaView edges={edges} style={[styles.safe, { backgroundColor: safeAreaColor }, contentStyle]}>
          {safeAreaEdgeColors?.top && edges.includes("top") ? (
            <View style={[styles.edgeBand, { backgroundColor: safeAreaEdgeColors.top }]} />
          ) : null}
          <View style={styles.content}>{children}</View>
          {safeAreaEdgeColors?.bottom && edges.includes("bottom") ? (
            <View style={[styles.edgeBand, { backgroundColor: safeAreaEdgeColors.bottom }]} />
          ) : null}
        </SafeAreaView>
      </View>
    </ScreenLayoutContext.Provider>
  );
}

/** Theme-aware background tokens for spreading into ScreenLayout. */
export function useScreenBackgrounds() {
  const theme = useAnthraTheme();
  return useMemo(() => createScreenBackgrounds(theme.colors), [theme.colors]);
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  safe: {
    flex: 1
  },
  content: {
    flex: 1
  },
  edgeBand: {
    height: 0
  }
});

export default ScreenLayout;
