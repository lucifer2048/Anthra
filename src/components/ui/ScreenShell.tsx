import type { ReactElement, ReactNode } from "react";
import { ScrollView, View, type RefreshControlProps, type StyleProp, type ViewStyle } from "react-native";
import type { Edge } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import { ScreenLayout, useScreenBackgrounds } from "../layout";
import type { ScreenBackgroundToken } from "../../design-system/backgrounds";
import { KeyboardAwareScrollView } from "./KeyboardAwareScrollView";
import { ScreenHeader, type ScreenHeaderProps } from "./ScreenHeader";

export type ScreenShellProps = {
  header: ScreenHeaderProps;
  children: ReactNode;
  footer?: ReactNode;
  stickyFooter?: ReactNode;
  bottomTab?: ReactNode;
  refreshControl?: ReactElement<RefreshControlProps>;
  background?: ScreenBackgroundToken;
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
  stickyFooter,
  bottomTab,
  refreshControl,
  background,
  scroll = true,
  keyboardAware = false,
  contentStyle,
  edges,
  wrapLayout = true
}: ScreenShellProps) {
  const theme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();

  const paddedContent = (
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
      {children}
    </View>
  );

  let body: ReactNode = paddedContent;
  if (keyboardAware) {
    body = (
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: theme.spacing["3xl"] }}
      >
        {paddedContent}
      </KeyboardAwareScrollView>
    );
  } else if (scroll) {
    body = (
      <ScrollView
        refreshControl={refreshControl}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: theme.spacing["3xl"] }}
        keyboardShouldPersistTaps="handled"
      >
        {paddedContent}
      </ScrollView>
    );
  }

  const inner = (
    <View style={{ flex: 1 }}>
      <View
        style={{
          width: "100%",
          maxWidth: theme.layout.contentMaxWidth,
          alignSelf: "center",
          paddingHorizontal: theme.layout.screenPadding
        }}
      >
        <ScreenHeader {...header} />
      </View>
      {body}
      {stickyFooter ?? footer}
      {bottomTab}
    </View>
  );

  if (!wrapLayout) return inner;

  return (
    <ScreenLayout {...(background ?? backgrounds.canvas)} safeAreaEdges={edges ?? (bottomTab ? ["top", "left", "right"] : ["top", "left", "right", "bottom"])}>
      {inner}
    </ScreenLayout>
  );
}
