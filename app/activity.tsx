import { ActivityBuddyScreen } from "../src/features/activity/ActivityBuddyScreen";
import { goHub } from "../src/app-shell/navigation";

export default function ActivityRoute() {
  return <ActivityBuddyScreen onBack={goHub} />;
}
