import { forwardRef, useState, type ReactNode } from "react";
import {
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { useFocusedInputScroller } from "./KeyboardAwareScrollView";

export type TextFieldProps = Omit<TextInputProps, "editable"> & {
  label: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  leadingIcon?: LucideIcon;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  reserveMessageSpace?: boolean;
  showCharacterCount?: boolean;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    helperText,
    error,
    required = false,
    disabled = false,
    leadingIcon: LeadingIcon,
    trailing,
    containerStyle,
    reserveMessageSpace = false,
    showCharacterCount = false,
    accessibilityLabel,
    accessibilityState,
    multiline = false,
    onFocus,
    onBlur,
    placeholderTextColor,
    selectionColor,
    style,
    ...props
  },
  ref
) {
  const theme = useAnthraTheme();
  const revealFocusedInput = useFocusedInputScroller();
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.brand
      : theme.colors.borderStrong;

  return (
    <View style={containerStyle}>
      <Text style={[theme.typography.label, { color: error ? theme.colors.danger : theme.colors.textPrimary, fontWeight: "700", marginBottom: theme.spacing.sm, letterSpacing: 0.2 }]}>
        {label}
        {required ? <Text style={{ color: theme.colors.danger }}> *</Text> : null}
      </Text>

      <View
        style={{
          width: "100%",
          flexDirection: "row",
          minHeight: multiline ? theme.layout.multilineFieldHeight : theme.sizes.control.large,
          alignItems: multiline ? "flex-start" : "center",
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: multiline ? theme.spacing.md : theme.spacing.sm,
          borderRadius: theme.radii.xl,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: disabled ? theme.colors.disabledSurface : theme.colors.surfaceSubtle,
          ...theme.shadows.low
        }}
      >
        {LeadingIcon && (
          <LeadingIcon
            accessible={false}
            color={disabled ? theme.colors.disabledText : theme.colors.textSecondary}
            size={20}
          />
        )}
        <TextInput
          {...props}
          ref={ref}
          editable={!disabled}
          multiline={multiline}
          accessibilityLabel={accessibilityLabel ?? `${label}${required ? ", required" : ""}`}
          accessibilityState={{ ...accessibilityState, disabled }}
          placeholderTextColor={placeholderTextColor ?? theme.colors.textTertiary}
          selectionColor={selectionColor ?? theme.colors.brand}
          onFocus={(event) => {
            setFocused(true);
            revealFocusedInput?.();
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.typography.bodyLarge,
            {
              minWidth: 0,
              flex: 1,
              color: disabled ? theme.colors.disabledText : theme.colors.textPrimary,
              padding: 0,
              textAlignVertical: multiline ? "top" : "center"
            },
            style
          ]}
        />
        {trailing}
      </View>

      {reserveMessageSpace || error || helperText || showCharacterCount ? <View style={{ minHeight: theme.typography.caption.lineHeight + theme.spacing.xs, flexDirection: "row", gap: theme.spacing.sm }}>
        {error || helperText ? (
          <Animated.Text
            entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.duration.fast)}
            exiting={reduceMotion ? undefined : FadeOut.duration(theme.motion.duration.fast)}
            accessibilityRole={error ? "alert" : undefined}
            accessibilityLiveRegion={error ? "assertive" : "polite"}
            style={[
              theme.typography.caption,
              { flex: 1, color: error ? theme.colors.danger : theme.colors.textSecondary, marginTop: theme.spacing.xs }
            ]}
          >
            {error ?? helperText}
          </Animated.Text>
        ) : <View style={{ flex: 1 }} />}
        {showCharacterCount && props.maxLength ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textTertiary, marginTop: theme.spacing.xs, fontVariant: ["tabular-nums"] }]}>
            {String(props.value ?? props.defaultValue ?? "").length}/{props.maxLength}
          </Text>
        ) : null}
      </View> : null}
    </View>
  );
});
