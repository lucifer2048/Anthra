import { View } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { StatusBanner, type StatusBannerProps } from "./StatusBanner";

export type ToastBannerProps = StatusBannerProps & {
  visible: boolean;
  topOffset: number;
};

export function ToastBanner({ visible, topOffset, style, ...props }: ToastBannerProps) {
  const theme = useAnthraTheme();
  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: theme.layout.screenPadding,
        right: theme.layout.screenPadding,
        top: topOffset,
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
            shadowColor: theme.isDark ? "#000000" : "#4B2028",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: theme.isDark ? 0.4 : 0.12,
            shadowRadius: 12,
            elevation: 6
          },
          style
        ]}
      />
    </View>
  );
}
