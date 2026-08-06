import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { X, type LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { KeyboardAwareScrollView } from "./KeyboardAwareScrollView";
import { StatusBanner } from "./StatusBanner";
import { Card } from "./Surface";

type DialogAction = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
};

export type FormDialogProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  primaryAction: DialogAction;
  secondaryAction?: DialogAction;
  destructiveAction?: DialogAction;
  error?: string | null;
  children: ReactNode;
  keyboardAware?: boolean;
  maxWidth?: number;
  contentStyle?: StyleProp<ViewStyle>;
};

function DialogFooter({
  primaryAction,
  secondaryAction,
  destructiveAction,
  stack
}: {
  primaryAction: DialogAction;
  secondaryAction?: DialogAction;
  destructiveAction?: DialogAction;
  stack: boolean;
}) {
  const theme = useAnthraTheme();
  return (
    <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
      <View style={{ flexDirection: stack ? "column" : "row", gap: theme.spacing.md }}>
        {secondaryAction ? (
          <Button
            label={secondaryAction.label}
            onPress={secondaryAction.onPress}
            variant="outline"
            disabled={secondaryAction.disabled}
            loading={secondaryAction.loading}
            style={{ flex: stack ? undefined : 1, alignSelf: "stretch" }}
          />
        ) : null}
        <Button
          label={primaryAction.label}
          icon={primaryAction.icon}
          onPress={primaryAction.onPress}
          variant="primary"
          disabled={primaryAction.disabled}
          loading={primaryAction.loading}
          style={{ flex: stack ? undefined : 1, alignSelf: "stretch" }}
        />
      </View>
      {destructiveAction ? (
        <Button
          label={destructiveAction.label}
          icon={destructiveAction.icon}
          onPress={destructiveAction.onPress}
          variant="danger"
          disabled={destructiveAction.disabled}
          loading={destructiveAction.loading}
          fullWidth
        />
      ) : null}
    </View>
  );
}

export function FormDialog({
  visible,
  title,
  subtitle,
  onClose,
  primaryAction,
  secondaryAction,
  destructiveAction,
  error,
  children,
  keyboardAware = true,
  maxWidth = 520,
  contentStyle
}: FormDialogProps) {
  const theme = useAnthraTheme();
  const { fontScale, width } = useWindowDimensions();
  const stack = width < 420 || fontScale >= 1.2;

  const body = (
    <Card
      variant="elevated"
      padding="large"
      accessibilityViewIsModal
      style={[{ width: "100%", maxWidth, alignSelf: "center" }, contentStyle]}
    >
      <View className="flex-row items-start" style={{ gap: theme.spacing.md }}>
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" style={[theme.typography.titleLarge, { color: theme.colors.textPrimary }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <IconButton icon={X} onPress={onClose} accessibilityLabel="Close" variant="ghost" />
      </View>

      {error ? (
        <StatusBanner title={error} variant="danger" style={{ marginTop: theme.spacing.lg }} />
      ) : null}

      <View style={{ marginTop: theme.spacing.lg }}>{children}</View>

      <DialogFooter
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        destructiveAction={destructiveAction}
        stack={stack}
      />
    </Card>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
        style={{ backgroundColor: theme.colors.scrim }}
      >
        {keyboardAware ? (
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: theme.spacing.xl,
              paddingVertical: theme.spacing.xl
            }}
          >
            {body}
          </KeyboardAwareScrollView>
        ) : (
          <Pressable
            className="flex-1 justify-center"
            style={{ paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.xl }}
            onPress={onClose}
          >
            <Pressable onPress={(event) => event.stopPropagation()}>{body}</Pressable>
          </Pressable>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type SheetDialogProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  primaryAction?: DialogAction;
  secondaryAction?: DialogAction;
  destructiveAction?: DialogAction;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
};

export function SheetDialog({
  visible,
  title,
  subtitle,
  onClose,
  primaryAction,
  secondaryAction,
  destructiveAction,
  error,
  children,
  footer
}: SheetDialogProps) {
  const theme = useAnthraTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
        style={{ backgroundColor: theme.colors.scrim }}
      >
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={{
            borderTopLeftRadius: theme.radii["2xl"],
            borderTopRightRadius: theme.radii["2xl"],
            backgroundColor: theme.colors.surfaceElevated,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
            maxHeight: "92%",
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing["2xl"]
          }}
        >
          <View className="flex-row items-start" style={{ gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
            <View className="min-w-0 flex-1">
              <Text accessibilityRole="header" style={[theme.typography.titleLarge, { color: theme.colors.textPrimary }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <IconButton icon={X} onPress={onClose} accessibilityLabel="Close" variant="ghost" />
          </View>

          {error ? (
            <StatusBanner title={error} variant="danger" style={{ marginBottom: theme.spacing.md }} />
          ) : null}

          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            contentContainerStyle={{ paddingBottom: theme.spacing.lg }}
          >
            {children}
          </KeyboardAwareScrollView>

          {footer}
          {primaryAction ? (
            <DialogFooter
              primaryAction={primaryAction}
              secondaryAction={secondaryAction}
              destructiveAction={destructiveAction}
              stack
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
