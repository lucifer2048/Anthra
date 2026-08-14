import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Platform } from "react-native";

export function useAppShellUi() {
  const hubScrollOffsetRef = useRef(0);
  const hasAnimatedHubCardsRef = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const handleHubCardsAnimated = useCallback(() => {
    hasAnimatedHubCardsRef.current = true;
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const keyboardSafeBottomPadding = keyboardHeight > 0 ? keyboardHeight + 16 : 24;

  return {
    hubScrollOffsetRef,
    hasAnimatedHubCardsRef,
    handleHubCardsAnimated,
    keyboardHeight,
    keyboardSafeBottomPadding
  };
}
