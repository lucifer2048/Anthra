import { CircleCheck, Info, TriangleAlert, XCircle, type LucideIcon } from "lucide-react-native";
import { Text, View, type ViewProps } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { IconButton } from "./IconButton";
import { X } from "lucide-react-native";

export type StatusBannerVariant = "info" | "success" | "warning" | "danger";

export type StatusBannerProps = Omit<ViewProps, "accessibilityRole"> & {
  title: string;
  message?: string;
  variant?: StatusBannerVariant;
  onDismiss?: () => void;
  dismissLabel?: string;
};

export function StatusBanner({
  title,
  message,
  variant = "info",
  onDismiss,
  dismissLabel = "Dismiss message",
  accessibilityLabel,
  className,
  style,
  ...props
}: StatusBannerProps) {
  const theme = useAnthraTheme();
  const variants: Record<StatusBannerVariant, { foreground: string; background: string; icon: LucideIcon }> = {
    info: { foreground: theme.colors.info, background: theme.colors.infoSoft, icon: Info },
    success: { foreground: theme.colors.success, background: theme.colors.successSoft, icon: CircleCheck },
    warning: { foreground: theme.colors.warning, background: theme.colors.warningSoft, icon: TriangleAlert },
    danger: { foreground: theme.colors.danger, background: theme.colors.dangerSoft, icon: XCircle }
  };
  const palette = variants[variant];
  const Icon = palette.icon;

  return (
    <View
      {...props}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion={variant === "danger" ? "assertive" : "polite"}
      accessibilityLabel={accessibilityLabel ?? [title, message].filter(Boolean).join(". ")}
      className={`w-full flex-row ${className ?? ""}`}
      style={[
        {
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radii.lg,
          borderWidth: 1,
          borderColor: palette.foreground,
          backgroundColor: palette.background
        },
        style
      ]}
    >
      <Icon accessible={false} color={palette.foreground} size={21} />
      <View className="min-w-0 flex-1">
        <Text style={[theme.typography.bodyStrong, { color: palette.foreground }]}>{title}</Text>
        {message && (
          <Text style={[theme.typography.body, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}>
            {message}
          </Text>
        )}
      </View>
      {onDismiss ? <IconButton icon={X} onPress={onDismiss} accessibilityLabel={dismissLabel} variant="ghost" size="small" haptic="none" /> : null}
    </View>
  );
}
