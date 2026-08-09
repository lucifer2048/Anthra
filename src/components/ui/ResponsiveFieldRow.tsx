import type { ReactNode } from "react";
import { View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";

export function ResponsiveFieldRow({
  children,
  breakpoint = 480,
  style
}: {
  children: ReactNode;
  breakpoint?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < breakpoint || fontScale >= 1.3;
  return (
    <View style={[{ flexDirection: stacked ? "column" : "row", gap: theme.spacing.md }, style]}>
      {children}
    </View>
  );
}
