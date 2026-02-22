import { useCallback } from "react";

type CueControls = {
  playShort: () => Promise<void>;
  playLong: () => Promise<void>;
};

export function useAudioCues(): CueControls {
  // Audio cues are intentionally disabled here to avoid deprecated expo-av runtime warnings.
  const playShort = useCallback(async () => undefined, []);
  const playLong = useCallback(async () => undefined, []);

  return { playShort, playLong };
}
