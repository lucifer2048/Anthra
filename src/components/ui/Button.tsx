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
  style,
  onPressIn,
  onPressOut,
  android_ripple,
  ...props
}: ButtonProps) {
  const theme = useAnthraTheme();
  const isDisabled = disabled || loading;
  const isVisuallyDisabled = disabled && !loading;

  const bgColors = {
    primary: theme.colors.brandSolid,
    secondary: theme.colors.surfaceSubtle,
    outline: "transparent",
    ghost: "transparent",
    danger: theme.colors.dangerSolid
  };

  const pressedBgColors = {
    primary: theme.colors.brandSolidPressed,
    secondary: theme.colors.surfacePressed,
    outline: theme.colors.surfacePressed,
    ghost: theme.colors.brandSoft,
    danger: theme.colors.dangerSolidPressed
  };

  const borderColors = {
    primary: theme.isDark ? "#FA2C49" : "#B80A22",
    secondary: theme.colors.brandBorder,
    outline: theme.colors.borderStrong,
    ghost: theme.colors.border,
    danger: theme.colors.dangerSolid
  };

  const fgColors = {
    primary: "#FFFFFF",
    secondary: theme.colors.brand,
    outline: theme.colors.textPrimary,
    ghost: theme.colors.brand,
    danger: theme.colors.textOnDangerSolid
  };

  const sizes = {
    small: { minHeight: 40, paddingHorizontal: theme.spacing.md, iconSize: theme.sizes.icon.sm, fontSize: 13 },
    medium: { minHeight: theme.sizes.control.regular, paddingHorizontal: theme.spacing.lg, iconSize: theme.sizes.icon.md, fontSize: 15 },
    large: { minHeight: 52, paddingHorizontal: theme.spacing.xl, iconSize: theme.sizes.icon.lg, fontSize: 16 }
  };

  const metrics = sizes[size];
  const contentColor = isVisuallyDisabled ? theme.colors.disabledText : fgColors[variant];

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
        ? { color: variant === "primary" || variant === "danger" ? "rgba(255,255,255,0.25)" : theme.colors.surfacePressed }
        : android_ripple}
      style={({ pressed }) => {
        const userStyle = typeof style === "function" ? style({ pressed }) : style;
        const flatUser = Array.isArray(userStyle) ? userStyle : [userStyle];
        const isFlatVariant = variant === "outline" || variant === "ghost";
        return [
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            width: fullWidth ? "100%" : undefined,
            alignSelf: fullWidth ? "stretch" : "flex-start",
            minHeight: metrics.minHeight,
            paddingHorizontal: metrics.paddingHorizontal,
            paddingVertical: theme.spacing.xs + 4,
            gap: theme.spacing.sm,
            borderRadius: variant === "ghost" ? theme.radii.full : size === "small" ? theme.radii.md : 16,
            borderWidth: 1.5,
            borderColor: isVisuallyDisabled ? theme.colors.border : borderColors[variant],
            backgroundColor: isVisuallyDisabled
              ? theme.colors.disabledSurface
              : pressed
                ? pressedBgColors[variant]
                : bgColors[variant],
            opacity: isVisuallyDisabled ? 0.6 : 1,
            shadowColor: variant === "primary" ? (theme.isDark ? "#E61937" : "#C40E28") : (theme.isDark ? "#000000" : "#3B141B"),
            shadowOffset: { width: 0, height: variant === "primary" ? 3 : 2 },
            shadowOpacity: isVisuallyDisabled || isFlatVariant ? 0 : variant === "primary" ? (theme.isDark ? 0.35 : 0.20) : 0.1,
            shadowRadius: variant === "primary" ? 10 : 4,
            elevation: isVisuallyDisabled || isFlatVariant ? 0 : variant === "primary" ? 4 : 2
          },
          ...flatUser
        ];
      }}
    >
      {(loading || (Icon && iconPosition === "start")) ? (
        <View style={{ width: metrics.iconSize, height: metrics.iconSize, alignItems: "center", justifyContent: "center" }}>
          {loading ? <ActivityIndicator color={contentColor} size="small" /> : Icon ? <Icon accessible={false} color={contentColor} size={metrics.iconSize} /> : null}
        </View>
      ) : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={[
          theme.typography.labelLarge,
          {
            color: contentColor,
            fontSize: metrics.fontSize,
            fontWeight: "700",
            letterSpacing: 0.3,
            textAlign: "center"
          }
        ]}
      >
        {label}
      </Text>
      {!loading && Icon && iconPosition === "end" && (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: variant === "primary" || variant === "danger"
              ? "rgba(255, 255, 255, 0.25)"
              : theme.colors.brandSoft,
            alignItems: "center",
            justifyContent: "center",
            marginLeft: 4
          }}
        >
          <Icon accessible={false} color={contentColor} size={15} strokeWidth={2.5} />
        </View>
      )}
    </AnimatedPressable>
  );
}
