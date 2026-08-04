import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import { ScreenLayout, useScreenBackgrounds } from "../layout";
import { KeyboardAwareScrollView } from "./KeyboardAwareScrollView";
import { ScreenHeader, type ScreenHeaderProps } from "./ScreenHeader";

export type ScreenShellProps = {
  header: ScreenHeaderProps;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Safe-area edges forwarded to ScreenLayout. */
  edges?: Edge[];
  /** When false, assumes an outer ScreenLayout already wraps this tree. */
  wrapLayout?: boolean;
};

/**
 * Inner screen composition (header + padded body + footer).
 * By default wraps with `ScreenLayout` + canvas background.
 */
export function ScreenShell({
  header,
  children,
  footer,
  scroll = true,
  keyboardAware = false,
  contentStyle,
  edges = ["top", "left", "right"],
  wrapLayout = true
}: ScreenShellProps) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();

  const padded = (
    <View
      style={[
        {
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: theme.layout.screenPadding,
          flexGrow: 1
        },
        contentStyle
      ]}
    >
      <ScreenHeader {...header} />
      {children}
    </View>
  );

  let body: ReactNode = padded;
  if (keyboardAware) {
    body = (
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: theme.spacing["3xl"] }}
      >
        {padded}
      </KeyboardAwareScrollView>
    );
  } else if (scroll) {
    body = (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: theme.spacing["3xl"] }}
        keyboardShouldPersistTaps="handled"
      >
        {padded}
      </ScrollView>
    );
  }

  const inner = (
    <View style={{ flex: 1 }}>
      {body}
      {footer}
    </View>
  );

  if (!wrapLayout) return inner;

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={edges}>
      {inner}
    </ScreenLayout>
  );
}
