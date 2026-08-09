import { Fragment, type ReactNode } from "react";

type WorkoutViewProps = { children: ReactNode };

/** Presentational boundaries keep WorkoutBuddyScreen focused on data orchestration. */
export function WorkoutOverview({ children }: WorkoutViewProps) {
  return <Fragment>{children}</Fragment>;
}

export function WorkoutPlansView({ children }: WorkoutViewProps) {
  return <Fragment>{children}</Fragment>;
}

export function WorkoutHistoryView({ children }: WorkoutViewProps) {
  return <Fragment>{children}</Fragment>;
}

export function BodyProfileView({ children }: WorkoutViewProps) {
  return <Fragment>{children}</Fragment>;
}

export function WorkoutSettingsView({ children }: WorkoutViewProps) {
  return <Fragment>{children}</Fragment>;
}
