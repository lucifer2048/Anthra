import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";
import { Star } from "lucide-react-native";

import { Button, KeyboardAwareScrollView, TextField } from "../../components/ui";
import { useAnthraTheme } from "../../design-system";
import { withAlpha } from "../../utils/format";

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
  const borderColor = theme.colors.border;
  const cardBackground = theme.colors.surfaceElevated;
  const inputBackground = theme.colors.surfaceSubtle;
  const panelBackground = theme.colors.surface;
  const textPrimary = theme.colors.textPrimary;
  const textMuted = theme.colors.textSecondary;

  return (
    <>
      <Modal
        visible={feedbackOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!saving) onDismiss();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 px-6"
          style={{ backgroundColor: theme.colors.scrim }}
        >
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}
          >
            <View
              accessibilityViewIsModal
              className="w-full rounded-3xl border p-5"
              style={{ borderColor, backgroundColor: cardBackground, maxWidth: 520, alignSelf: "center" }}
            >
              <Text className="text-xl font-black" style={{ color: textPrimary }}>
                Rate Session
              </Text>
              <Text className="mt-2 text-sm" style={{ color: textMuted }}>
                {planName} is complete. Add a quick rating and optional note for your history.
              </Text>

              <View
                className="mt-4 flex-row justify-between rounded-2xl border px-3 py-3"
                style={{ borderColor, backgroundColor: inputBackground }}
              >
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = rating >= star;
                  return (
                    <Pressable
                      key={`rating-${star}`}
                      onPress={() => onRatingChange(star)}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${star} out of 5`}
                      accessibilityState={{ selected: rating === star }}
                      className="h-11 w-11 items-center justify-center rounded-xl"
                      style={{ backgroundColor: active ? withAlpha(accentColor, 0.25) : panelBackground }}
                    >
                      <Star
                        accessible={false}
                        size={23}
                        color={active ? accentColor : theme.colors.textTertiary}
                        fill={active ? accentColor : "transparent"}
                      />
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={onOpenNote}
                accessibilityRole="button"
                accessibilityLabel="Add or edit session note"
                className="mt-4 min-h-[110px] rounded-2xl border px-4 py-3"
                style={{ borderColor: theme.colors.borderStrong, backgroundColor: inputBackground }}
              >
                <Text className="text-xs font-semibold uppercase tracking-[1.2px]" style={{ color: textMuted }}>
                  Session Note
                </Text>
                <Text
                  className="mt-2 text-sm"
                  style={{ color: comment.trim() ? textPrimary : theme.colors.textTertiary }}
                >
                  {comment.trim() || "Tap to add how this session felt."}
                </Text>
              </Pressable>

              <View className="mt-5 flex-row gap-3">
                <Button
                  label="Later"
                  onPress={onDismiss}
                  disabled={saving}
                  variant="outline"
                  fullWidth
                  style={{ flex: 1 }}
                />
                <Button
                  label="Save feedback"
                  onPress={onSubmit}
                  loading={saving}
                  fullWidth
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={feedbackNoteOpen}
        transparent
        animationType="fade"
        onRequestClose={onCloseNote}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 px-6"
          style={{ backgroundColor: theme.colors.scrim }}
        >
          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 24 }}
          >
            <View
              accessibilityViewIsModal
              className="w-full rounded-3xl border p-5"
              style={{ borderColor, backgroundColor: cardBackground, maxWidth: 520, alignSelf: "center" }}
            >
              <Text className="text-xl font-black" style={{ color: textPrimary }}>
                Session Note
              </Text>
              <TextField
                label="How did it feel?"
                value={comment}
                onChangeText={onCommentChange}
                multiline
                autoFocus
                textAlignVertical="top"
                maxLength={400}
                placeholder="Energy, effort, pain, or anything worth remembering"
                helperText={`${comment.length}/400 characters`}
                containerStyle={{ marginTop: 16 }}
              />
              <View className="mt-5 flex-row gap-3">
                <Button
                  label="Done"
                  onPress={onCloseNote}
                  variant="outline"
                  fullWidth
                  style={{ flex: 1 }}
                />
                <Button
                  label="Clear note"
                  onPress={() => {
                    onCommentChange("");
                    onCloseNote();
                  }}
                  variant="secondary"
                  fullWidth
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
