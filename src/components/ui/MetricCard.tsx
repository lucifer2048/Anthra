import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { ProgressBar } from "./ProgressBar";
import { Card } from "./Surface";

export type MetricCardProps = {
  title: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  progress?: number;
  style?: StyleProp<ViewStyle>;
};

export function MetricCard({ title, value, unit, icon: Icon, progress, style }: MetricCardProps) {
  const theme = useAnthraTheme();
  return (
    <Card
      padding="medium"
      radius="xlarge"
      style={[
        {
          minHeight: 104,
          borderWidth: 1.5,
          borderColor: theme.colors.borderStrong,
          backgroundColor: theme.colors.surfaceSubtle,
          ...theme.shadows.low
        },
        style
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
        {Icon ? (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: theme.radii.md,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.brandBorder,
              backgroundColor: theme.colors.brandSoft
            }}
          >
            <Icon accessible={false} color={theme.colors.brand} size={20} strokeWidth={2.2} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[theme.typography.eyebrow, { color: theme.colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 }]}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing.xs, marginTop: theme.spacing.xxs }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.2} style={[theme.typography.metric, { minWidth: 0, flexShrink: 1, color: theme.colors.textPrimary, fontWeight: "800" }]}>{value}</Text>
            {unit ? <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[theme.typography.caption, { flexShrink: 1, color: theme.colors.textSecondary, fontWeight: "500" }]}>{unit}</Text> : null}
          </View>
        </View>
      </View>
      {progress !== undefined ? <ProgressBar value={progress} max={1} style={{ marginTop: theme.spacing.md }} /> : null}
    </Card>
  );
}
