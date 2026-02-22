import { View } from "react-native";

type ProgressBarProps = {
  value: number;
  max: number;
};

export function ProgressBar({ value, max }: ProgressBarProps) {
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));

  return (
    <View className="h-3 w-full overflow-hidden rounded-full bg-white/10">
      <View
        className="h-3 rounded-full bg-neon-green"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </View>
  );
}

