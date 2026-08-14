import { VaultBuddyScreen } from "../src/features/vault/VaultBuddyScreen";
import { goHub } from "../src/app-shell/navigation";

export default function VaultRoute() {
  return <VaultBuddyScreen onBack={goHub} />;
}
