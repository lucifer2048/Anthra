import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import {
  darkColors,
  layout,
  lightColors,
  motion,
  radii,
  spacing,
  typography,
  type SemanticColors
} from "./tokens";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = Exclude<ThemeMode, "system">;

export type ResolvedTheme = Readonly<{
  mode: ResolvedThemeMode;
  isDark: boolean;
  statusBarStyle: "light" | "dark";
  colors: SemanticColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  motion: typeof motion;
  layout: typeof layout;
}>;

const lightTheme: ResolvedTheme = Object.freeze({
  mode: "light",
  isDark: false,
  statusBarStyle: "dark",
  colors: lightColors,
  spacing,
  radii,
  typography,
  motion,
  layout
});

const darkTheme: ResolvedTheme = Object.freeze({
  mode: "dark",
  isDark: true,
  statusBarStyle: "light",
  colors: darkColors,
  spacing,
  radii,
  typography,
  motion,
  layout
});

export const themes = Object.freeze({ light: lightTheme, dark: darkTheme });

export function resolveThemeMode(
  mode: ThemeMode,
  systemMode: ResolvedThemeMode | null | undefined = "light"
): ResolvedThemeMode {
  if (mode !== "system") return mode;
  return systemMode === "dark" ? "dark" : "light";
}

export function resolveTheme(
  mode: ThemeMode,
  systemMode?: ResolvedThemeMode | null
): ResolvedTheme {
  return themes[resolveThemeMode(mode, systemMode)];
}

export type ThemeModeController = Readonly<{
  mode: ThemeMode;
  resolvedMode: ResolvedThemeMode;
  setMode: (mode: ThemeMode) => void;
}>;

type ThemeContextValue = Readonly<{
  theme: ResolvedTheme;
  controller: ThemeModeController;
}>;

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  children: ReactNode;
  mode?: ThemeMode;
  defaultMode?: ThemeMode;
  onModeChange?: (mode: ThemeMode) => void;
};

/**
 * Controls semantic tokens and keeps NativeWind's `dark:` classes in sync.
 * Persistence remains the app shell's responsibility via `mode`/`onModeChange`.
 */
export function ThemeProvider({
  children,
  mode: controlledMode,
  defaultMode = "system",
  onModeChange
}: ThemeProviderProps) {
  const [uncontrolledMode, setUncontrolledMode] = useState<ThemeMode>(defaultMode);
  const systemMode = useSystemColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();
  const activeMode = controlledMode ?? uncontrolledMode;
  const theme = resolveTheme(activeMode, systemMode);

  useLayoutEffect(() => {
    setColorScheme(activeMode);
  }, [activeMode, setColorScheme]);

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      // Reset/apply the native appearance override before the controlled mode
      // changes so returning to Auto does not render against a stale override.
      setColorScheme(nextMode);
      if (controlledMode === undefined) setUncontrolledMode(nextMode);
      onModeChange?.(nextMode);
    },
    [controlledMode, onModeChange, setColorScheme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      controller: {
        mode: activeMode,
        resolvedMode: theme.mode,
        setMode
      }
    }),
    [activeMode, setMode, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Returns the active semantic theme, with a system-aware fallback before the provider is wired. */
export function useAnthraTheme(): ResolvedTheme {
  const context = useContext(ThemeContext);
  const systemMode = useSystemColorScheme();
  return context?.theme ?? resolveTheme("system", systemMode);
}

/** Must be used below ThemeProvider because it mutates the provider's selected mode. */
export function useThemeMode(): ThemeModeController {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeMode must be used within an Anthra ThemeProvider");
  }
  return context.controller;
}
