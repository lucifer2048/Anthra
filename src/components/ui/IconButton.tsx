import { useState } from "react";
import { Platform, Pressable, type PressableProps } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";

export type IconButtonVariant = "standard" | "ghost" | "primary" | "danger";
export type IconButtonSize = "small" | "medium" | "large";

export type IconButtonProps = Omit<PressableProps, "children" | "disabled"> & {
  icon: LucideIcon;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  color?: string;
  disabled?: boolean;
};

export function IconButton({
  icon: Icon,
  accessibilityLabel,
  variant = "standard",
  size = "medium",
  color,
  disabled = false,
  accessibilityState,
  className,
  style,
  onPressIn,
  onPressOut,
  android_ripple,
  ...props
}: IconButtonProps) {
  const theme = useAnthraTheme();
  const [pressed, setPressed] = useState(false);
  const variants = {
    standard: {
      background: theme.colors.surface,
      pressed: theme.colors.surfacePressed,
      border: theme.colors.border,
      foreground: theme.colors.textPrimary,
      borderWidth: 1
    },
    ghost: {
      background: "transparent",
      pressed: theme.colors.surfacePressed,
      border: "transparent",
      foreground: theme.colors.textPrimary,
      borderWidth: 0
    },
    primary: {
      background: theme.colors.brandSolid,
      pressed: theme.colors.brandSolidPressed,
      border: theme.colors.brandSolid,
      foreground: theme.colors.textOnBrandSolid,
      borderWidth: 1
    },
    danger: {
      background: theme.colors.dangerSoft,
      pressed: theme.colors.surfacePressed,
      border: theme.colors.danger,
      foreground: theme.colors.danger,
      borderWidth: 1
    }
  } as const;
  const sizes = {
    small: { target: theme.layout.compactTouchTarget, icon: 18 },
    medium: { target: theme.layout.minTouchTarget, icon: 22 },
    large: { target: 56, icon: 24 }
  } as const;
  const palette = variants[variant];
  const metrics = sizes[size];
  const foreground = disabled ? theme.colors.disabledText : (color ?? palette.foreground);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      android_ripple={android_ripple === undefined && Platform.OS === "android"
        ? { color: variant === "primary" ? "rgba(255,255,255,0.18)" : theme.colors.surfacePressed, borderless: true }
        : android_ripple}
      className={`items-center justify-center rounded-full ${className ?? ""}`}
      style={[
        {
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
          transform: [{ scale: pressed && !disabled ? theme.motion.pressedScale : 1 }]
        },
        typeof style === "function" ? style({ pressed }) : style
      ]}
    >
      <Icon accessible={false} color={foreground} size={metrics.icon} />
    </Pressable>
  );
}
