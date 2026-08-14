import { useLocalSearchParams } from "expo-router";

import { FriendsScreen } from "../src/features/social";
import { useAppShell } from "../src/app-shell/AppShellContext";
import { goHub } from "../src/app-shell/navigation";

export default function FriendsRoute() {
  const { initialTab } = useLocalSearchParams<{ initialTab?: "friends" | "leaderboard" }>();
  const { onOpenAccountFromFriends } = useAppShell();

  return (
    <FriendsScreen
      onBack={goHub}
      onOpenAccount={onOpenAccountFromFriends}
      initialTab={initialTab === "leaderboard" ? "leaderboard" : "friends"}
    />
  );
}
