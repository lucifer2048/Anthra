import type { ReactNode } from "react";
import { SheetDialog } from "../../components/ui";

export function ReminderEditorSheet({ visible, editing, saving, error, onClose, onSave, children }: { visible: boolean; editing: boolean; saving: boolean; error?: string; onClose: () => void; onSave: () => void; children: ReactNode }) {
  return (
    <SheetDialog
      visible={visible}
      title={editing ? "Edit reminder" : "New reminder"}
      subtitle="Choose when and how Anthra should remind you."
      onClose={onClose}
      backdropDismissEnabled={!saving}
      error={error || null}
      primaryAction={{ label: "Save reminder", onPress: onSave, loading: saving }}
      secondaryAction={{ label: "Cancel", onPress: onClose, disabled: saving }}
    >
      {children}
    </SheetDialog>
  );
}
