import { AlarmBuddyScreen } from "../src/features/alarm";
import { goHub } from "../src/app-shell/navigation";

export default function AlarmRoute() {
  return <AlarmBuddyScreen onBack={goHub} />;
}
