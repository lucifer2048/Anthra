import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type ScrollViewProps
} from "react-native";

type FocusScroller = () => void;

const FocusScrollContext = createContext<FocusScroller | null>(null);

export function useFocusedInputScroller(): FocusScroller | null {
  return useContext(FocusScrollContext);
}

export type KeyboardAwareScrollViewProps = ScrollViewProps & {
  children: ReactNode;
  extraKeyboardSpace?: number;
};

/**
 * Makes modal forms reliable on Android versions where a translucent modal and
 * edge-to-edge layout can prevent KeyboardAvoidingView from resizing correctly.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  function KeyboardAwareScrollView(
    {
      children,
      contentContainerStyle,
      extraKeyboardSpace = 20,
      keyboardShouldPersistTaps = "handled",
      keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
      automaticallyAdjustKeyboardInsets = Platform.OS === "ios",
      style,
      ...props
    },
    forwardedRef
  ) {
    const scrollRef = useRef<ScrollView>(null);
    const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);

    useImperativeHandle(forwardedRef, () => scrollRef.current as ScrollView, []);

    const revealFocusedInput = useCallback(
      () => {
        requestAnimationFrame(() => {
          const focusedInput = TextInput.State.currentlyFocusedInput?.();
          if (!focusedInput) return;
          scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(
            focusedInput,
            extraKeyboardSpace,
            true
          );
        });
      },
      [extraKeyboardSpace]
    );

    useEffect(() => {
      if (Platform.OS !== "android") return undefined;

      const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
        setAndroidKeyboardHeight(event.endCoordinates.height);
        setTimeout(() => revealFocusedInput(), 40);
      });
      const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
        setAndroidKeyboardHeight(0);
      });

      return () => {
        showSubscription.remove();
        hideSubscription.remove();
      };
    }, [revealFocusedInput]);

    return (
      <FocusScrollContext.Provider value={revealFocusedInput}>
        <ScrollView
          {...props}
          ref={scrollRef}
          style={style}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
          contentContainerStyle={[
            contentContainerStyle,
            androidKeyboardHeight > 0
              ? {
                  justifyContent: "flex-start",
                  paddingBottom: androidKeyboardHeight + extraKeyboardSpace
                }
              : undefined
          ]}
        >
          {children}
        </ScrollView>
      </FocusScrollContext.Provider>
    );
  }
);
