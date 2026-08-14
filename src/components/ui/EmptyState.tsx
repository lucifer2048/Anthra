import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useAnthraTheme } from "../../design-system";
import { Button } from "./Button";
import { Card } from "./Surface";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void; icon?: LucideIcon };
  variant?: "card" | "inline" | "brand";
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "card",
  style,
  children
}: EmptyStateProps) {
  const theme = useAnthraTheme();
  const content = (
    <View style={{ alignItems: "center" }}>
      <View
        className="items-center justify-center"
        style={{
          width: variant === "inline" ? 52 : 64,
          height: variant === "inline" ? 52 : 64,
          borderRadius: theme.radii.full,
          backgroundColor:
            variant === "brand" ? theme.colors.surface : theme.colors.brandSoft
        }}
      >
        <Icon
          accessible={false}
          color={theme.colors.brand}
          size={variant === "inline" ? 24 : 30}
        />
      </View>
      <Text
        style={[
          theme.typography.titleMedium,
          {
            color: theme.colors.textPrimary,
            textAlign: "center",
            marginTop: theme.spacing.lg
          }
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text
          style={[
            theme.typography.body,
            {
              color: theme.colors.textSecondary,
              textAlign: "center",
              marginTop: theme.spacing.sm
            }
          ]}
        >
          {description}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: theme.spacing.xl, width: "100%" }}>
          <Button label={action.label} icon={action.icon} onPress={action.onPress} fullWidth />
        </View>
      ) : null}
      {children}
    </View>
  );

  if (variant === "inline") {
    return <View style={style}>{content}</View>;
  }

  return (
    <Card
      padding="large"
      variant={variant === "brand" ? "brand" : "default"}
      style={style}
    >
      {content}
    </Card>
  );
}
