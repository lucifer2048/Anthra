import { View, type ViewProps, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";

export type SurfaceVariant = "default" | "elevated" | "subtle" | "brand" | "danger";
export type SurfacePadding = "none" | "small" | "medium" | "large";
export type SurfaceRadius = "none" | "small" | "medium" | "large" | "xlarge";
export type SurfaceElevation = "none" | "low" | "medium" | "overlay";
export type CardTreatment = "default" | "inset" | "interactive" | "stat" | "grouped";

export type SurfaceProps = ViewProps & {
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
  radius?: SurfaceRadius;
  bordered?: boolean;
  elevation?: SurfaceElevation;
};

type CardTreatmentPreset = {
  padding: SurfacePadding;
  radius: Exclude<SurfaceRadius, "none">;
  bordered: boolean;
  elevation: SurfaceElevation;
  overflow: ViewStyle["overflow"];
  variant?: SurfaceVariant;
};

const CARD_TREATMENTS: Record<CardTreatment, CardTreatmentPreset> = {
  default: {
    padding: "large",
    radius: "xlarge",
    bordered: true,
    elevation: "low",
    overflow: "visible"
  },
  inset: {
    padding: "medium",
    radius: "large",
    bordered: true,
    elevation: "none",
    overflow: "visible",
    variant: "subtle"
  },
  interactive: {
    padding: "medium",
    radius: "xlarge",
    bordered: true,
    elevation: "low",
    overflow: "visible",
    variant: "elevated"
  },
  stat: {
    padding: "medium",
    radius: "large",
    bordered: true,
    elevation: "none",
    overflow: "visible"
  },
  grouped: {
    padding: "none",
    radius: "xlarge",
    bordered: true,
    elevation: "none",
    overflow: "hidden"
  }
};

export function Surface({
  variant = "default",
  padding = "none",
  radius = "none",
  bordered = false,
  elevation,
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
          minWidth: 0,
          padding: paddings[padding],
          borderRadius: radiuses[radius],
          borderWidth: bordered ? theme.borderWidths.standard : 0,
          borderColor: variant === "brand"
            ? theme.colors.brandBorder
            : variant === "danger"
              ? theme.colors.danger
              : theme.colors.border,
          backgroundColor: backgrounds[variant]
        },
        theme.shadows[elevation ?? (variant === "elevated" ? "medium" : "none")],
        style
      ]}
    />
  );
}

export type CardProps = Omit<SurfaceProps, "radius"> & {
  radius?: Exclude<SurfaceRadius, "none">;
  treatment?: CardTreatment;
};

export function Card({
  treatment = "default",
  padding,
  radius,
  bordered,
  elevation,
  variant,
  style,
  ...props
}: CardProps) {
  const preset = CARD_TREATMENTS[treatment];
  const resolvedVariant = variant ?? preset.variant ?? "default";
  return (
    <Surface
      {...props}
      variant={resolvedVariant}
      padding={padding ?? preset.padding}
      radius={radius ?? preset.radius}
      bordered={bordered ?? preset.bordered}
      elevation={
        elevation ??
        (treatment === "interactive"
          ? preset.elevation
          : resolvedVariant === "elevated"
            ? "medium"
            : preset.elevation)
      }
      style={[{ overflow: preset.overflow }, style]}
    />
  );
}
