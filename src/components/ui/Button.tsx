import { ActivityIndicator, Platform, Text, View, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable, type HapticMode } from "./AnimatedPressable";

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
  haptic?: HapticMode;
  loadingAccessibilityLabel?: string;
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
  haptic = "none",
  loadingAccessibilityLabel,
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
    small: { minHeight: theme.sizes.control.compact, paddingHorizontal: theme.spacing.md, iconSize: theme.sizes.icon.sm },
    medium: { minHeight: theme.sizes.control.regular, paddingHorizontal: theme.spacing.lg, iconSize: theme.sizes.icon.md },
    large: { minHeight: theme.sizes.control.large, paddingHorizontal: theme.spacing.xl, iconSize: theme.sizes.icon.lg }
  } as const;

  const palette = variants[variant];
  const metrics = sizes[size];
  const contentColor = isVisuallyDisabled ? theme.colors.disabledText : palette.foreground;

  return (
    <AnimatedPressable
      {...props}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={loading ? (loadingAccessibilityLabel ?? `${accessibilityLabel ?? label}, loading`) : (accessibilityLabel ?? label)}
      accessibilityState={{
        ...accessibilityState,
        disabled: isDisabled,
        busy: loading
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      haptic={loading || disabled ? "none" : haptic}
      android_ripple={android_ripple === undefined && Platform.OS === "android"
        ? { color: variant === "primary" || variant === "danger" ? "rgba(255,255,255,0.18)" : theme.colors.surfacePressed }
        : android_ripple}
      className={`flex-row items-center justify-center ${fullWidth ? "w-full" : ""} ${className ?? ""}`}
      style={({ pressed }) => [
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
          alignSelf: fullWidth ? "stretch" : "flex-start"
        },
        typeof style === "function" ? style({ pressed }) : style
      ]}
    >
      {(loading || (Icon && iconPosition === "start")) ? (
        <View style={{ width: metrics.iconSize, height: metrics.iconSize, alignItems: "center", justifyContent: "center" }}>
          {loading ? <ActivityIndicator color={palette.foreground} size="small" /> : Icon ? <Icon accessible={false} color={contentColor} size={metrics.iconSize} /> : null}
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
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
    </AnimatedPressable>
  );
}
