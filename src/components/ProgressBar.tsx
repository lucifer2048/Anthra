import { View } from "react-native";

type ProgressBarProps = {
  value: number;
  max: number;
  fillColor?: string;
  trackColor?: string;
};

export function ProgressBar({ value, max, fillColor, trackColor }: ProgressBarProps) {
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  const resolvedFill = fillColor ?? "#5BE8B4";
  const resolvedTrack = trackColor ?? "rgba(255,255,255,0.1)";

  return (
    <View className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: resolvedTrack }}>
      <View
        className="h-3 rounded-full"
        style={{ backgroundColor: resolvedFill, width: `${Math.round(ratio * 100)}%` }}
      />
    </View>
  );
}
