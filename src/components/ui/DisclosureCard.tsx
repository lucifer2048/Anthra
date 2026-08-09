import { useEffect, useState, type ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ChevronDown } from "lucide-react-native";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";
import { Card } from "./Surface";

export function DisclosureCard({
  title,
  summary,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onExpandedChange,
  style
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const reduceMotion = useReducedMotion();
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? localExpanded;
  const rotation = useSharedValue(expanded ? 180 : 0);

  useEffect(() => {
    rotation.value = reduceMotion ? (expanded ? 180 : 0) : withTiming(expanded ? 180 : 0, { duration: theme.motion.duration.standard });
  }, [expanded, reduceMotion, rotation, theme.motion.duration.standard]);

  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const toggle = () => {
    const next = !expanded;
    if (controlledExpanded === undefined) setLocalExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(theme.motion.duration.deliberate)} style={style}>
      <Card padding="none">
        <AnimatedPressable
          onPress={toggle}
          haptic="selection"
          pressScale="subtle"
          accessibilityRole="button"
          accessibilityLabel={title}
          accessibilityState={{ expanded }}
        >
          <View style={{ minHeight: theme.sizes.control.large, padding: theme.spacing.lg, flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]}>{title}</Text>
              {summary ? <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]}>{summary}</Text> : null}
            </View>
            <Animated.View style={chevronStyle}>
              <ChevronDown accessible={false} size={theme.sizes.icon.md} color={theme.colors.textSecondary} />
            </Animated.View>
          </View>
        </AnimatedPressable>
        {expanded ? <View style={{ borderTopWidth: theme.borderWidths.standard, borderColor: theme.colors.divider, padding: theme.spacing.lg }}>{children}</View> : null}
      </Card>
    </Animated.View>
  );
}
