import type { ReactNode } from "react";
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAnthraTheme } from "../../design-system";
import { KeyboardAwareScrollView } from "./KeyboardAwareScrollView";
import { ScreenHeader, type ScreenHeaderProps } from "./ScreenHeader";

export type ScreenShellProps = {
  header: ScreenHeaderProps;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Array<"top" | "right" | "bottom" | "left">;
};

export function ScreenShell({
  header,
  children,
  footer,
  scroll = true,
  keyboardAware = false,
  contentStyle,
  edges = ["top", "left", "right"]
}: ScreenShellProps) {
  const theme = useAnthraTheme();

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

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={{ flex: 1 }}>
        {body}
        {footer}
      </View>
    </SafeAreaView>
  );
}
