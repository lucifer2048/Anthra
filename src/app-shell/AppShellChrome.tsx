import { useEffect, useRef } from "react";
import {
  BackHandler,
  Keyboard,
  Platform,
  ToastAndroid,
  View
} from "react-native";
import { router, usePathname } from "expo-router";

import { LaunchOverlay } from "../components/LaunchOverlay";
import { WorkoutFeedbackModals } from "../features/workout/WorkoutFeedbackModals";
import { goHub, openTimer } from "./navigation";
import { useAppShell } from "./AppShellContext";

export function AppShellChrome() {
  const {
    activePlan,
    activeTab,
    setActiveTab,
    editorOpen,
    setEditorOpen,
    setEditingPlan,
    feedbackOpen,
    feedbackNoteModalOpen,
    feedbackPlanName,
    feedbackRating,
    feedbackComment,
    feedbackSaving,
    setFeedbackRating,
    setFeedbackComment,
    setFeedbackNoteModalOpen,
    setFeedbackOpen,
    handleSubmitFeedback,
    showSplashOverlay,
    splashOpacity,
    moduleTheme,
    keyboardHeight,
    appBackground
  } = useAppShell();

  const pathname = usePathname();
  const lastBackPressRef = useRef(0);

  useEffect(() => {
    if (activePlan && pathname !== "/timer") {
      openTimer();
    }
  }, [activePlan, pathname]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (keyboardHeight > 0) {
        Keyboard.dismiss();
        return true;
      }
      if (activePlan) {
        return false;
      }
      if (feedbackNoteModalOpen) {
        setFeedbackNoteModalOpen(false);
        return true;
      }
      if (feedbackOpen) {
        if (!feedbackSaving) setFeedbackOpen(false);
        return true;
      }
      if (editorOpen) {
        setEditorOpen(false);
        setEditingPlan(null);
        return true;
      }
      if (pathname.startsWith("/workout") && activeTab !== "home") {
        setActiveTab("home");
        return true;
      }
      if (pathname !== "/" && pathname !== "/index") {
        if (router.canGoBack()) {
          router.back();
        } else {
          goHub();
        }
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        return false;
      }
      lastBackPressRef.current = now;
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [
    activePlan,
    activeTab,
    editorOpen,
    feedbackNoteModalOpen,
    feedbackOpen,
    feedbackSaving,
    keyboardHeight,
    pathname,
    setActiveTab,
    setEditingPlan,
    setEditorOpen,
    setFeedbackNoteModalOpen,
    setFeedbackOpen
  ]);

  return (
    <>
      <WorkoutFeedbackModals
        feedbackOpen={feedbackOpen}
        feedbackNoteOpen={feedbackNoteModalOpen}
        planName={feedbackPlanName}
        rating={feedbackRating}
        comment={feedbackComment}
        saving={feedbackSaving}
        accentColor={moduleTheme.accent}
        onRatingChange={setFeedbackRating}
        onCommentChange={setFeedbackComment}
        onOpenNote={() => setFeedbackNoteModalOpen(true)}
        onCloseNote={() => setFeedbackNoteModalOpen(false)}
        onDismiss={() => setFeedbackOpen(false)}
        onSubmit={() => {
          handleSubmitFeedback().catch(() => undefined);
        }}
      />

      {showSplashOverlay ? (
        <View pointerEvents="none" style={{ position: "absolute", inset: 0, backgroundColor: appBackground }}>
          <LaunchOverlay opacity={splashOpacity} />
        </View>
      ) : null}
    </>
  );
}
