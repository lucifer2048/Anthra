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
    <Card treatment="stat" style={[{ minHeight: 100 }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, minWidth: 0 }}>
        {Icon ? <Icon accessible={false} color={theme.colors.brand} size={theme.sizes.icon.lg} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[theme.typography.eyebrow, { color: theme.colors.textSecondary, textTransform: "uppercase" }]}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing.xs, marginTop: theme.spacing.xs, minWidth: 0 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} maxFontSizeMultiplier={1.2} style={[theme.typography.metric, { minWidth: 0, flexShrink: 1, color: theme.colors.textPrimary }]}>{value}</Text>
            {unit ? <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[theme.typography.caption, { flexShrink: 1, color: theme.colors.textSecondary }]}>{unit}</Text> : null}
          </View>
        </View>
      </View>
      {progress !== undefined ? <ProgressBar value={progress} max={1} style={{ marginTop: theme.spacing.md }} /> : null}
    </Card>
  );
}
