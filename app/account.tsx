import { AccountScreen } from "../src/features/account";
import { goHub } from "../src/app-shell/navigation";

export default function AccountRoute() {
  return <AccountScreen onBack={goHub} />;
}
