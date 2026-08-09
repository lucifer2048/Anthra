import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { UserRound } from "lucide-react-native";

function usableAvatarUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function ProfileAvatar({
  uri,
  size,
  fallbackColor,
  backgroundColor
}: {
  uri: string | null | undefined;
  size: number;
  fallbackColor: string;
  backgroundColor: string;
}) {
  const safeUri = usableAvatarUrl(uri);
  const [failedUri, setFailedUri] = useState<string | null>(null);

  useEffect(() => {
    if (safeUri !== failedUri) setFailedUri(null);
  }, [safeUri]);

  const showImage = Boolean(safeUri && safeUri !== failedUri);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor
      }}
    >
      {showImage ? (
        <Image
          source={{ uri: safeUri! }}
          resizeMode="cover"
          fadeDuration={0}
          onError={() => setFailedUri(safeUri)}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <UserRound accessible={false} color={fallbackColor} size={Math.round(size * 0.44)} />
      )}
    </View>
  );
}
