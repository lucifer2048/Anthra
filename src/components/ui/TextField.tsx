import { forwardRef, useState, type ReactNode } from "react";
import {
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from "react-native";
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
  containerClassName?: string;
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
    containerClassName,
    accessibilityLabel,
    accessibilityState,
    className,
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
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.focusRing
      : theme.colors.borderStrong;

  return (
    <View className={containerClassName} style={containerStyle}>
      <Text style={[theme.typography.label, { color: error ? theme.colors.danger : theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>
        {label}
        {required ? <Text style={{ color: theme.colors.danger }}> *</Text> : null}
      </Text>

      <View
        className="w-full flex-row items-center"
        style={{
          minHeight: multiline ? 120 : 56,
          alignItems: multiline ? "flex-start" : "center",
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: multiline ? theme.spacing.md : theme.spacing.sm,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor,
          backgroundColor: disabled ? theme.colors.disabledSurface : theme.colors.surfaceSubtle
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
          className={`min-w-0 flex-1 ${className ?? ""}`}
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
              color: disabled ? theme.colors.disabledText : theme.colors.textPrimary,
              padding: 0,
              textAlignVertical: multiline ? "top" : "center"
            },
            style
          ]}
        />
        {trailing}
      </View>

      {(error || helperText) && (
        <Text
          accessibilityRole={error ? "alert" : undefined}
          accessibilityLiveRegion={error ? "assertive" : "polite"}
          style={[
            theme.typography.caption,
            {
              color: error ? theme.colors.danger : theme.colors.textSecondary,
              marginTop: theme.spacing.xs
            }
          ]}
        >
          {error ?? helperText}
        </Text>
      )}
    </View>
  );
});
