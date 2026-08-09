import { KeyboardAvoidingView, Platform, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { Button, type ButtonVariant } from "./Button";

export type StickyFormAction = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
};

export function StickyFormFooter({
  primaryAction,
  secondaryAction,
  ownsSafeArea = true,
  style
}: {
  primaryAction: StickyFormAction;
  secondaryAction?: StickyFormAction;
  ownsSafeArea?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stack = width < 340 || fontScale >= 1.5;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[{ borderTopWidth: theme.borderWidths.standard, borderColor: theme.colors.divider, backgroundColor: theme.colors.surface, paddingHorizontal: theme.layout.screenPadding, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.md + (ownsSafeArea ? insets.bottom : 0), flexDirection: stack ? "column-reverse" : "row", gap: theme.spacing.md }, theme.shadows.low, style]}>
        {secondaryAction ? <Button {...secondaryAction} variant={secondaryAction.variant ?? "outline"} style={{ flex: stack ? undefined : 1, alignSelf: "stretch" }} /> : null}
        <Button {...primaryAction} variant={primaryAction.variant ?? "primary"} style={{ flex: stack ? undefined : 1, alignSelf: "stretch" }} />
      </View>
    </KeyboardAvoidingView>
  );
}
