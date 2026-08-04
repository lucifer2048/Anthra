import { useMemo } from "react";
import { useAnthraTheme } from "../../design-system";
import { createScreenBackgrounds } from "../../design-system/backgrounds";

/** Theme-aware background tokens for spreading into ScreenLayout. */
export function useScreenBackgrounds() {
  const theme = useAnthraTheme();
  return useMemo(() => createScreenBackgrounds(theme.colors), [theme.colors]);
}
