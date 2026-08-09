import { ClipboardList, History, Home } from "lucide-react-native";
import { BottomTabBar } from "./ui/BottomTabBar";

export type WorkoutTab = "home" | "plans" | "history";

type WorkoutTabBarProps = {
  activeTab: WorkoutTab;
  onChange: (tab: WorkoutTab) => void;
};

const TABS = [
  { id: "home" as const, label: "Today", icon: Home },
  { id: "plans" as const, label: "Plans", icon: ClipboardList },
  { id: "history" as const, label: "History", icon: History }
];

export function WorkoutTabBar({ activeTab, onChange }: WorkoutTabBarProps) {
  return (
    <BottomTabBar
      tabs={TABS}
      activeTab={activeTab}
      onChange={onChange}
      safeArea
      accessibilityHintPrefix="Opens workout"
    />
  );
}
