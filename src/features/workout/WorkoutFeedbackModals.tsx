import { Text } from "react-native";

import { FormDialog, InteractiveCard, RatingControl, SheetDialog, TextField } from "../../components/ui";
import { useAnthraTheme } from "../../design-system";

export type WorkoutFeedbackModalsProps = {
  feedbackOpen: boolean;
  feedbackNoteOpen: boolean;
  planName: string;
  rating: number;
  comment: string;
  saving: boolean;
  accentColor: string;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onOpenNote: () => void;
  onCloseNote: () => void;
  onDismiss: () => void;
  onSubmit: () => void;
};

/**
 * App-root session feedback modals. Kept outside WorkoutBuddyScreen so they
 * remain available after TimerScreen clears `activePlan` and remounts the shell.
 */
export function WorkoutFeedbackModals({
  feedbackOpen,
  feedbackNoteOpen,
  planName,
  rating,
  comment,
  saving,
  accentColor,
  onRatingChange,
  onCommentChange,
  onOpenNote,
  onCloseNote,
  onDismiss,
  onSubmit
}: WorkoutFeedbackModalsProps) {
  const theme = useAnthraTheme();

  return (
    <>
      <FormDialog
        visible={feedbackOpen}
        title="Rate session"
        subtitle={`${planName} is complete. Add a quick rating and optional note for your history.`}
        onClose={onDismiss}
        backdropDismissEnabled={!saving}
        primaryAction={{ label: "Save feedback", onPress: onSubmit, loading: saving }}
        secondaryAction={{ label: "Later", onPress: onDismiss, disabled: saving }}
      >
        <RatingControl value={rating} onChange={onRatingChange} />
        <InteractiveCard
          onPress={onOpenNote}
          accessibilityLabel="Add or edit session note"
          cardProps={{ variant: "subtle", padding: "medium" }}
          style={{ marginTop: theme.spacing.lg }}
        >
          <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>Session note</Text>
          <Text numberOfLines={3} style={[theme.typography.body, { color: comment.trim() ? theme.colors.textPrimary : theme.colors.textTertiary, marginTop: theme.spacing.sm }]}>{comment.trim() || "Tap to add how this session felt."}</Text>
        </InteractiveCard>
      </FormDialog>

      <SheetDialog
        visible={feedbackNoteOpen}
        title="Session note"
        onClose={onCloseNote}
        primaryAction={{ label: "Done", onPress: onCloseNote }}
        secondaryAction={{ label: "Clear note", onPress: () => { onCommentChange(""); onCloseNote(); } }}
      >
        <TextField label="How did it feel?" value={comment} onChangeText={onCommentChange} multiline autoFocus textAlignVertical="top" maxLength={400} showCharacterCount placeholder="Energy, effort, pain, or anything worth remembering" />
      </SheetDialog>
    </>
  );
}
