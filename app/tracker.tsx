import { TrackerBuddyScreen } from "../src/features/tracker/TrackerBuddyScreen";
import { goHub } from "../src/app-shell/navigation";

export default function TrackerRoute() {
  return <TrackerBuddyScreen onBack={goHub} />;
}
