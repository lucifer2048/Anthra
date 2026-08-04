import { ClipboardList, History, Home, Settings, UserRound } from "lucide-react-native";
import { BottomTabBar } from "./ui/BottomTabBar";

export type WorkoutTab = "home" | "plans" | "history" | "profile" | "settings";

type WorkoutTabBarProps = {
  activeTab: WorkoutTab;
  onChange: (tab: WorkoutTab) => void;
};

const TABS = [
  { id: "home" as const, label: "Today", icon: Home },
  { id: "plans" as const, label: "Plans", icon: ClipboardList },
  { id: "history" as const, label: "History", icon: History },
  { id: "profile" as const, label: "Profile", icon: UserRound },
  { id: "settings" as const, label: "Settings", icon: Settings }
];

export function WorkoutTabBar({ activeTab, onChange }: WorkoutTabBarProps) {
  return (
    <BottomTabBar
      tabs={TABS}
      activeTab={activeTab}
      onChange={onChange}
      accessibilityHintPrefix="Opens workout"
    />
  );
}
