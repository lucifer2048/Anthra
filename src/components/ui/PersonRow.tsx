import type { ReactNode } from "react";
import { Image, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import { useAnthraTheme } from "../../design-system";
import { AnimatedPressable } from "./AnimatedPressable";

export function PersonRow({
  name,
  subtitle,
  avatar,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  disabled = false,
  style
}: {
  name: string;
  subtitle?: string;
  avatar?: ImageSourcePropType;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useAnthraTheme();
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const content = (
    <View style={{ minHeight: theme.sizes.control.large, flexDirection: "row", alignItems: "center", gap: theme.spacing.md, paddingVertical: theme.spacing.sm }}>
      {leading ?? (avatar ? (
        <Image source={avatar} accessibilityLabel={`${name} avatar`} style={{ width: theme.sizes.control.regular, height: theme.sizes.control.regular, borderRadius: theme.radii.full }} />
      ) : (
        <View style={{ width: theme.sizes.control.regular, height: theme.sizes.control.regular, borderRadius: theme.radii.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.brandSoft }}>
          <Text style={[theme.typography.labelLarge, { color: theme.colors.brand }]}>{initials}</Text>
        </View>
      ))}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={[theme.typography.bodyStrong, { color: disabled ? theme.colors.disabledText : theme.colors.textPrimary }]}
        >
          {name}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
            style={[theme.typography.caption, { color: disabled ? theme.colors.disabledText : theme.colors.textSecondary, marginTop: theme.spacing.xs }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
    </View>
  );
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <AnimatedPressable onPress={onPress} disabled={disabled} haptic="selection" pressScale="subtle" accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? name} style={style}>
      {content}
    </AnimatedPressable>
  );
}
