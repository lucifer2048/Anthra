import { ListBuddyScreen } from "../src/features/list/ListBuddyScreen";
import { goHub } from "../src/app-shell/navigation";

export default function ListRoute() {
  return <ListBuddyScreen onBack={goHub} />;
}
