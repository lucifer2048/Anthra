import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { ScreenBackgroundToken } from "../../design-system/backgrounds";

export type BackgroundLayerProps = ScreenBackgroundToken & {
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-bleed background plane. Renders behind safe-area content.
 * Do not put interactive UI here.
 */
export function BackgroundLayer({
  color,
  gradient,
  image,
  imageResizeMode = "cover",
  withBgCircle = false,
  circleColor,
  style
}: BackgroundLayerProps) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: color }, style]}>
      {gradient && gradient.colors.length >= 2 ? (
        <LinearGradient
          colors={gradient.colors as [string, string, ...string[]]}
          start={gradient.start ?? { x: 0.5, y: 0 }}
          end={gradient.end ?? { x: 0.5, y: 1 }}
          locations={
            gradient.locations && gradient.locations.length === gradient.colors.length
              ? (gradient.locations as [number, number, ...number[]])
              : undefined
          }
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}

      {image ? (
        <Image
          source={image as ImageSourcePropType}
          resizeMode={imageResizeMode}
          style={StyleSheet.absoluteFillObject}
          accessibilityIgnoresInvertColors
        />
      ) : null}

      {withBgCircle ? (
        <View
          style={{
            position: "absolute",
            top: -120,
            right: -80,
            width: 280,
            height: 280,
            borderRadius: 999,
            backgroundColor: circleColor ?? "rgba(200, 16, 46, 0.12)",
            opacity: 0.9
          }}
        />
      ) : null}
    </View>
  );
}
