import { View, type StyleProp, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { Button, type ButtonProps } from "./Button";
import { ProgressBar, type ProgressBarProps } from "./ProgressBar";

type SpacingToken = "md" | "lg" | "xl" | "2xl" | "none";

export type CardActionFooterAction = Pick<
  ButtonProps,
  | "label"
  | "onPress"
  | "icon"
  | "iconPosition"
  | "variant"
  | "size"
  | "loading"
  | "disabled"
  | "accessibilityLabel"
  | "accessibilityHint"
  | "fullWidth"
>;

export type CardActionFooterProps = {
  /** Primary card footer action. Spacing is applied on a wrapper, not the pressable. */
  action?: CardActionFooterAction;
  progress?: ProgressBarProps;
  /** Space above the whole footer block. Default: `xl`. */
  insetTop?: SpacingToken;
  /** Space between the progress track and action. Default: `xl`. */
  gap?: SpacingToken;
  style?: StyleProp<ViewStyle>;
};

function resolveSpacing(token: SpacingToken, spacing: ReturnType<typeof useAnthraTheme>["spacing"]) {
  return token === "none" ? 0 : spacing[token];
}

/**
 * Card footer region for optional progress plus a primary action.
 * Keeps spacing on layout wrappers so Button/Pressable margins stay reliable.
 */
export function CardActionFooter({
  action,
  progress,
  insetTop = "xl",
  gap = "xl",
  style
}: CardActionFooterProps) {
  const theme = useAnthraTheme();

  if (!progress && !action) return null;

  return (
    <View
      style={[
        {
          marginTop: resolveSpacing(insetTop, theme.spacing),
          gap: progress && action ? resolveSpacing(gap, theme.spacing) : 0
        },
        style
      ]}
    >
      {progress ? <ProgressBar {...progress} /> : null}
      {action ? (
        <View>
          <Button
            {...action}
            fullWidth={action.fullWidth ?? true}
            size={action.size ?? "large"}
            variant={action.variant ?? "primary"}
          />
        </View>
      ) : null}
    </View>
  );
}
