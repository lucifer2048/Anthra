import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "small" | "medium" | "large";

export type ButtonProps = Omit<PressableProps, "children" | "disabled"> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: "start" | "end";
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
};

export function Button({
  label,
  variant = "primary",
  size = "medium",
  icon: Icon,
  iconPosition = "start",
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityState,
  className,
  style,
  onPressIn,
  onPressOut,
  android_ripple,
  ...props
}: ButtonProps) {
  const theme = useAnthraTheme();
  const [pressed, setPressed] = useState(false);
  const isDisabled = disabled || loading;
  const isVisuallyDisabled = disabled && !loading;

  const variants = {
    primary: {
      background: theme.colors.brandSolid,
      pressed: theme.colors.brandSolidPressed,
      border: theme.colors.brandSolid,
      foreground: theme.colors.textOnBrandSolid
    },
    secondary: {
      background: theme.colors.brandSoft,
      pressed: theme.colors.surfacePressed,
      border: theme.colors.brandBorder,
      foreground: theme.colors.brand
    },
    outline: {
      background: theme.colors.surface,
      pressed: theme.colors.surfacePressed,
      border: theme.colors.borderStrong,
      foreground: theme.colors.textPrimary
    },
    ghost: {
      background: "transparent",
      pressed: theme.colors.brandSoft,
      border: "transparent",
      foreground: theme.colors.brand
    },
    danger: {
      background: theme.colors.dangerSolid,
      pressed: theme.colors.dangerSolidPressed,
      border: theme.colors.dangerSolid,
      foreground: theme.colors.textOnDangerSolid
    }
  } as const;

  const sizes = {
    small: { minHeight: 44, paddingHorizontal: 14, iconSize: 18 },
    medium: { minHeight: theme.layout.minTouchTarget, paddingHorizontal: 18, iconSize: 20 },
    large: { minHeight: 56, paddingHorizontal: 22, iconSize: 22 }
  } as const;

  const palette = variants[variant];
  const metrics = sizes[size];
  const contentColor = isVisuallyDisabled ? theme.colors.disabledText : palette.foreground;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: loading
      }}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      android_ripple={android_ripple === undefined && Platform.OS === "android"
        ? { color: variant === "primary" || variant === "danger" ? "rgba(255,255,255,0.18)" : theme.colors.surfacePressed }
        : android_ripple}
      className={`flex-row items-center justify-center ${fullWidth ? "w-full" : ""} ${className ?? ""}`}
      style={[
        {
          minHeight: metrics.minHeight,
          paddingHorizontal: metrics.paddingHorizontal,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
          borderRadius: size === "small" ? theme.radii.md : theme.radii.lg,
          borderWidth: variant === "ghost" ? 0 : 1,
          borderColor: isVisuallyDisabled ? theme.colors.border : palette.border,
          backgroundColor: isVisuallyDisabled
            ? theme.colors.disabledSurface
            : pressed
              ? palette.pressed
              : palette.background,
          opacity: isVisuallyDisabled ? theme.motion.disabledOpacity : 1,
          transform: [{ scale: pressed && !isDisabled ? theme.motion.pressedScale : 1 }],
          alignSelf: fullWidth ? "stretch" : "flex-start"
        },
        typeof style === "function" ? style({ pressed }) : style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.foreground} size="small" />
      ) : (
        Icon && iconPosition === "start" && <Icon accessible={false} color={contentColor} size={metrics.iconSize} />
      )}
      <Text
        style={[
          theme.typography.labelLarge,
          {
            color: contentColor,
            flexShrink: 1,
            textAlign: "center"
          }
        ]}
      >
        {label}
      </Text>
      {!loading && Icon && iconPosition === "end" && (
        <Icon accessible={false} color={contentColor} size={metrics.iconSize} />
      )}
    </Pressable>
  );
}
