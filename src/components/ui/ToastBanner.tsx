import { View } from "react-native";
import Animated, { FadeInDown, FadeOutUp, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import { StatusBanner, type StatusBannerProps } from "./StatusBanner";

export type ToastBannerProps = StatusBannerProps & {
  visible: boolean;
  topOffset?: number;
};

export function ToastBanner({ visible, topOffset, style, ...props }: ToastBannerProps) {
  const theme = useAnthraTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  if (!visible) return null;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(theme.motion.duration.deliberate)}
      exiting={reduceMotion ? undefined : FadeOutUp.duration(theme.motion.duration.standard)}
      pointerEvents={props.onDismiss ? "auto" : "none"}
      style={{
        position: "absolute",
        left: theme.layout.screenPadding,
        right: theme.layout.screenPadding,
        top: topOffset ?? insets.top + theme.spacing.sm,
        zIndex: 20,
        maxWidth: theme.layout.contentMaxWidth,
        alignSelf: "center",
        width: "100%"
      }}
    >
      <StatusBanner
        {...props}
        style={[
          {
            ...theme.shadows.overlay
          },
          style
        ]}
      />
    </Animated.View>
  );
}
