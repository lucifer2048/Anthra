import { Platform, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable, type HapticMode } from "./AnimatedPressable";

export type IconButtonVariant = "standard" | "outline" | "ghost" | "primary" | "danger";
export type IconButtonSize = "small" | "medium" | "large";

export type IconButtonProps = Omit<PressableProps, "children" | "disabled"> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  color?: string;
  disabled?: boolean;
  haptic?: HapticMode;
};

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  variant = "standard",
  size = "medium",
  color,
  disabled = false,
  haptic = "none",
  accessibilityState,
  style,
  onPressIn,
  onPressOut,
  android_ripple,
  ...props
}: IconButtonProps) {
  const theme = useAnthraTheme();
  const variants = {
    standard: {
      background: theme.colors.surfaceElevated,
      pressed: theme.colors.surfacePressed,
      border: theme.colors.borderStrong,
      foreground: theme.colors.textPrimary,
      borderWidth: 1.5
    },
    outline: {
      background: "transparent",
      pressed: theme.colors.surfacePressed,
      border: theme.colors.borderStrong,
      foreground: theme.colors.textPrimary,
      borderWidth: 1.5
    },
    ghost: {
      background: theme.colors.surfaceSubtle,
      pressed: theme.colors.brandSoft,
      border: theme.colors.border,
      foreground: theme.colors.brand,
      borderWidth: 1.5
    },
    primary: {
      background: theme.colors.brandSolid,
      pressed: theme.colors.brandSolidPressed,
      border: theme.colors.brandBorder,
      foreground: theme.colors.textOnBrandSolid,
      borderWidth: 1.5
    },
    danger: {
      background: theme.colors.dangerSoft,
      pressed: theme.colors.surfacePressed,
      border: theme.colors.danger,
      foreground: theme.colors.danger,
      borderWidth: 1.5
    }
  } as const;
  const sizes = {
    small: { target: theme.sizes.control.compact, icon: theme.sizes.icon.sm },
    medium: { target: theme.sizes.control.regular, icon: 22 },
    large: { target: theme.sizes.control.large, icon: theme.sizes.icon.lg }
  } as const;
  const palette = variants[variant];
  const metrics = sizes[size];
  const foreground = disabled ? theme.colors.disabledText : (color ?? palette.foreground);

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      haptic={disabled ? "none" : haptic}
      pressScale="icon"
      android_ripple={android_ripple === undefined && Platform.OS === "android"
        ? { color: variant === "primary" ? "rgba(255,255,255,0.18)" : theme.colors.surfacePressed, borderless: true }
        : android_ripple}
      style={({ pressed }) => [
        {
          alignItems: "center",
          justifyContent: "center",
          width: metrics.target,
          height: metrics.target,
          borderRadius: theme.radii.full,
          borderWidth: palette.borderWidth,
          borderColor: disabled ? theme.colors.border : palette.border,
          backgroundColor: disabled
            ? theme.colors.disabledSurface
            : pressed
              ? palette.pressed
              : palette.background,
          opacity: disabled ? theme.motion.disabledOpacity : 1,
        },
        typeof style === "function" ? style({ pressed }) : style
      ]}
    >
      <Icon accessible={false} color={foreground} size={metrics.icon} />
    </AnimatedPressable>
  );
}
