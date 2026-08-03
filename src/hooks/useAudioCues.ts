import { useCallback, useEffect, useRef } from "react";
import { AudioModule, AudioPlayer, createAudioPlayer } from "expo-audio";

type CueControls = {
  playShort: () => void;
  playLong: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const beepShortSource = require("../../assets/audio/beep-short.wav");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const beepLongSource = require("../../assets/audio/beep-long.wav");

export function useAudioCues(): CueControls {
  const shortRef = useRef<AudioPlayer | null>(null);
  const longRef = useRef<AudioPlayer | null>(null);
  const shortHasPlayedRef = useRef(false);
  const longHasPlayedRef = useRef(false);

  useEffect(() => {
    let shortPlayer: AudioPlayer | null = null;
    let longPlayer: AudioPlayer | null = null;
    let cancelled = false;

    const preparePlayers = () => {
      try {
        AudioModule.setAudioModeAsync({
          playsInSilentMode: true,
          interruptionMode: "mixWithOthers"
        }).catch(() => undefined);
      } catch {
        // Mode setup can be unsupported on some Android devices; local playback should still work.
      }

      if (cancelled) return;
      try {
        shortPlayer = createAudioPlayer(beepShortSource, {
          downloadFirst: true,
          keepAudioSessionActive: true
        });
        longPlayer = createAudioPlayer(beepLongSource, {
          downloadFirst: true,
          keepAudioSessionActive: true
        });
        shortRef.current = shortPlayer;
        longRef.current = longPlayer;
        shortHasPlayedRef.current = false;
        longHasPlayedRef.current = false;
      } catch {
        // Audio unavailable on this platform.
      }
    };

    preparePlayers();

    return () => {
      cancelled = true;
      shortRef.current = null;
      longRef.current = null;
      shortHasPlayedRef.current = false;
      longHasPlayedRef.current = false;
      try { shortPlayer?.remove(); } catch { /* cleanup */ }
      try { longPlayer?.remove(); } catch { /* cleanup */ }
    };
  }, []);

  const playShort = useCallback(() => {
    try {
      const player = shortRef.current;
      if (!player) return;
      if (!shortHasPlayedRef.current) {
        shortHasPlayedRef.current = true;
        player.play();
        return;
      }
      player.pause();
      player.replace(beepShortSource);
      player.play();
    } catch {
      // Ignore playback errors; haptics still provide a countdown cue.
    }
  }, []);

  const playLong = useCallback(() => {
    try {
      const player = longRef.current;
      if (!player) return;
      if (!longHasPlayedRef.current) {
        longHasPlayedRef.current = true;
        player.play();
        return;
      }
      player.pause();
      player.replace(beepLongSource);
      player.play();
    } catch {
      // Ignore playback errors; haptics still provide a transition cue.
    }
  }, []);

  return { playShort, playLong };
}
