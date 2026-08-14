import { useLocalSearchParams } from "expo-router";

import type { ReminderTab } from "../src/components/ReminderTabBar";
import { ReminderBuddyScreen } from "../src/features/reminder/ReminderBuddyScreen";
import { useAppShell } from "../src/app-shell/AppShellContext";

const REMINDER_TABS: ReminderTab[] = ["reminders", "history"];

export default function ReminderRoute() {
  const { initialTab } = useLocalSearchParams<{ initialTab?: string }>();
  const { onReminderBack } = useAppShell();
  const tab = REMINDER_TABS.includes(initialTab as ReminderTab) ? (initialTab as ReminderTab) : undefined;

  return <ReminderBuddyScreen onBack={onReminderBack} initialTab={tab} />;
}
