import { View, type ViewProps } from "react-native";
import { useAnthraTheme } from "../../design-system";

export type SurfaceVariant = "default" | "elevated" | "subtle" | "brand" | "danger";
export type SurfacePadding = "none" | "small" | "medium" | "large";
export type SurfaceRadius = "none" | "small" | "medium" | "large" | "xlarge";

export type SurfaceProps = ViewProps & {
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
  radius?: SurfaceRadius;
  bordered?: boolean;
};

export function Surface({
  variant = "default",
  padding = "none",
  radius = "none",
  bordered = false,
  className,
  style,
  ...props
}: SurfaceProps) {
  const theme = useAnthraTheme();
  const backgrounds = {
    default: theme.colors.surface,
    elevated: theme.colors.surfaceElevated,
    subtle: theme.colors.surfaceSubtle,
    brand: theme.colors.brandSoft,
    danger: theme.colors.dangerSoft
  } as const;
  const paddings = {
    none: 0,
    small: theme.spacing.md,
    medium: theme.spacing.lg,
    large: theme.spacing["2xl"]
  } as const;
  const radiuses = {
    none: theme.radii.none,
    small: theme.radii.sm,
    medium: theme.radii.md,
    large: theme.radii.lg,
    xlarge: theme.radii["2xl"]
  } as const;

  return (
    <View
      {...props}
      className={className}
      style={[
        {
          padding: paddings[padding],
          borderRadius: radiuses[radius],
          borderWidth: bordered ? 1 : 0,
          borderColor: variant === "brand"
            ? theme.colors.brandBorder
            : variant === "danger"
              ? theme.colors.danger
              : theme.colors.border,
          backgroundColor: backgrounds[variant]
        },
        variant === "elevated"
          ? {
              shadowColor: theme.isDark ? "#000000" : "#4B2028",
              shadowOffset: { width: 0, height: 5 },
              shadowOpacity: theme.isDark ? 0.32 : 0.09,
              shadowRadius: 14,
              elevation: 4
            }
          : undefined,
        style
      ]}
    />
  );
}

export type CardProps = Omit<SurfaceProps, "radius"> & {
  radius?: Exclude<SurfaceRadius, "none">;
};

export function Card({
  padding = "medium",
  radius = "xlarge",
  bordered = true,
  ...props
}: CardProps) {
  return <Surface {...props} padding={padding} radius={radius} bordered={bordered} />;
}
