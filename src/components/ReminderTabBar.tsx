import { BellRing, History } from "lucide-react-native";
import { BottomTabBar } from "./ui/BottomTabBar";

export type ReminderTab = "reminders" | "history";

type Props = {
  activeTab: ReminderTab;
  onChange: (tab: ReminderTab) => void;
};

const TABS = [
  { id: "reminders" as const, label: "Reminders", icon: BellRing },
  { id: "history" as const, label: "History", icon: History }
];

export function ReminderTabBar({ activeTab, onChange }: Props) {
  return (
    <BottomTabBar
      tabs={TABS}
      activeTab={activeTab}
      onChange={onChange}
      accessibilityHintPrefix="Opens reminder"
    />
  );
}
