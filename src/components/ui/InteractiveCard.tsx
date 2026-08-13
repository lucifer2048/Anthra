import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { AnimatedPressable, type AnimatedPressableProps } from "./AnimatedPressable";
import { Card, type CardProps } from "./Surface";

export type InteractiveCardProps = Omit<AnimatedPressableProps, "children" | "style"> & {
  children: ReactNode;
  cardProps?: Omit<CardProps, "children">;
  style?: StyleProp<ViewStyle>;
};

export function InteractiveCard({ children, cardProps, style, ...props }: InteractiveCardProps) {
  return (
    <AnimatedPressable
      {...props}
      style={[{ minWidth: 0 }, style]}
      pressScale={props.pressScale ?? "subtle"}
    >
      <Card treatment="interactive" {...cardProps}>{children}</Card>
    </AnimatedPressable>
  );
}
