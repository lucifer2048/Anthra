import { Fragment, type ReactNode } from "react";
import { Card, SheetDialog } from "./ui";
import { useAnthraTheme } from "../design-system";

export function PlanBasicsSection({ children }: { children: ReactNode }) { return <Fragment>{children}</Fragment>; }
export function PlanScheduleSection({ children }: { children: ReactNode }) { return <Fragment>{children}</Fragment>; }

export function WorkoutSetCard({ children }: { children: ReactNode }) {
  const theme = useAnthraTheme();
  return <Card treatment="inset" style={{ marginTop: theme.spacing.lg }}>{children}</Card>;
}

type EditorSheetProps = { visible: boolean; title: string; subtitle: string; onClose: () => void; actionLabel: string; onSave: () => void; children: ReactNode };
function EditorSheet({ visible, title, subtitle, onClose, actionLabel, onSave, children }: EditorSheetProps) {
  return <SheetDialog visible={visible} title={title} subtitle={subtitle} onClose={onClose} primaryAction={{ label: actionLabel, onPress: onSave }} secondaryAction={{ label: "Cancel", onPress: onClose }}>{children}</SheetDialog>;
}
export function SetEditorSheet(props: EditorSheetProps) { return <EditorSheet {...props} />; }
export function ExerciseEditorSheet(props: EditorSheetProps) { return <EditorSheet {...props} />; }
