import { ChartNoAxesCombined, CircleCheckBig, SlidersHorizontal } from "lucide-react-native";
import { BottomTabBar } from "../../components/ui/BottomTabBar";

export type TrackerTab = "today" | "reports" | "manage";

type Props = {
  activeTab: TrackerTab;
  onChange: (tab: TrackerTab) => void;
};

const TABS = [
  { id: "today" as const, label: "Today", icon: CircleCheckBig },
  { id: "reports" as const, label: "Reports", icon: ChartNoAxesCombined },
  { id: "manage" as const, label: "Manage", icon: SlidersHorizontal }
];

export function TrackerTabBar({ activeTab, onChange }: Props) {
  return (
    <BottomTabBar
      tabs={TABS}
      activeTab={activeTab}
      onChange={onChange}
      safeArea
      accessibilityHintPrefix="Opens tracker"
    />
  );
}
