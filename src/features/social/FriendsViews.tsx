import type { ReactNode } from "react";
import { View } from "react-native";
import { useAnthraTheme } from "../../design-system";

function ViewStack({ children }: { children: ReactNode }) {
  const theme = useAnthraTheme();
  return <View style={{ gap: theme.spacing.lg }}>{children}</View>;
}

export function FriendsListView({ children }: { children: ReactNode }) {
  return <ViewStack>{children}</ViewStack>;
}

export function LeaderboardView({ children }: { children: ReactNode }) {
  return <ViewStack>{children}</ViewStack>;
}

export function SocialPrivacyView({ children }: { children: ReactNode }) {
  return <ViewStack>{children}</ViewStack>;
}
