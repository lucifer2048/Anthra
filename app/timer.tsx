import { Redirect } from "expo-router";

import { TimerScreen } from "../src/components/TimerScreen";
import { useAppShell } from "../src/app-shell/AppShellContext";

export default function TimerRoute() {
  const {
    activePlan,
    activeTimerInitialState,
    handleWorkoutComplete,
    closeTimer,
    handleTimerStateChange,
    moduleTheme
  } = useAppShell();

  if (!activePlan) {
    return <Redirect href="/" />;
  }

  return (
    <TimerScreen
      plan={activePlan}
      onComplete={handleWorkoutComplete}
      onBack={closeTimer}
      initialState={activeTimerInitialState}
      onStateChange={handleTimerStateChange}
      accentColor={moduleTheme.accent}
      accentSoftColor={moduleTheme.accentSoft}
    />
  );
}
