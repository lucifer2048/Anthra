import { Platform, type TextStyle } from "react-native";

/**
 * Anthra's raw semantic color roles. Components should consume these roles
 * instead of palette literals so light and dark themes remain interchangeable.
 */
export const lightColors = {
  canvas: "#FCFAFA",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSubtle: "#F7F2F3",
  surfacePressed: "#F3E9EB",
  scrim: "rgba(18, 9, 11, 0.54)",

  textPrimary: "#1A1718",
  textSecondary: "#6B5F61",
  textTertiary: "#786B6E",
  textInverse: "#FFFFFF",
  // Non-solid roles are safe on soft/tinted surfaces. Solid CTA surfaces
  // deliberately use the *Solid roles below so their white text stays explicit.
  textOnBrand: "#6E1020",
  textOnBrandSolid: "#FFFFFF",
  textOnDanger: "#68150F",
  textOnDangerSolid: "#FFFFFF",

  brand: "#C8102E",
  brandPressed: "#A90D27",
  brandSolid: "#C8102E",
  brandSolidPressed: "#A90D27",
  brandSoft: "#FFF0F2",
  brandBorder: "#F1B9C2",

  border: "#E9DEE0",
  borderStrong: "#D6C6C9",
  divider: "#EEE5E7",
  focusRing: "#C8102E",
  progressTrack: "#E9DEE0",

  disabledSurface: "#EFE9EA",
  disabledText: "#998D8F",

  success: "#157347",
  successSoft: "#E9F7EF",
  warning: "#8A5700",
  warningSoft: "#FFF5DB",
  danger: "#B42318",
  dangerPressed: "#941B13",
  dangerSolid: "#B42318",
  dangerSolidPressed: "#941B13",
  dangerSoft: "#FFF0EF",
  info: "#155E75",
  infoSoft: "#E9F7FB"
} as const;

export type SemanticColorRole = keyof typeof lightColors;
export type SemanticColors = Readonly<Record<SemanticColorRole, string>>;

export const darkColors = {
  canvas: "#070707",
  surface: "#111111",
  surfaceElevated: "#191617",
  surfaceSubtle: "#151213",
  surfacePressed: "#211A1C",
  scrim: "rgba(0, 0, 0, 0.72)",

  textPrimary: "#F8F5F5",
  textSecondary: "#B8AFB0",
  textTertiary: "#918789",
  textInverse: "#1A1718",
  textOnBrand: "#170204",
  textOnBrandSolid: "#FFFFFF",
  textOnDanger: "#1B0505",
  textOnDangerSolid: "#FFFFFF",

  brand: "#FF3B4D",
  brandPressed: "#E82E42",
  brandSolid: "#E01E3A",
  brandSolidPressed: "#C8102E",
  brandSoft: "#2A0E13",
  brandBorder: "#66303A",

  border: "#322A2C",
  borderStrong: "#4A3D40",
  divider: "#282123",
  focusRing: "#FF6675",
  progressTrack: "#322A2C",

  disabledSurface: "#211D1E",
  disabledText: "#6F6768",

  success: "#4ADE80",
  successSoft: "#10271A",
  warning: "#FBBF24",
  warningSoft: "#2B210A",
  danger: "#FF6B6B",
  dangerPressed: "#E75656",
  dangerSolid: "#D9363E",
  dangerSolidPressed: "#BC2B34",
  dangerSoft: "#321314",
  info: "#67E8F9",
  infoSoft: "#10272C"
} as const satisfies SemanticColors;

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  "6xl": 64
} as const;

export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  full: 999
} as const;

type TypographyToken = Readonly<
  Pick<TextStyle, "fontFamily" | "fontSize" | "lineHeight" | "fontWeight" | "letterSpacing">
>;

const systemFontFamily = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System"
});

export const typography = {
  display: { fontFamily: systemFontFamily, fontSize: 36, lineHeight: 42, fontWeight: "700", letterSpacing: -0.8 },
  headline: { fontFamily: systemFontFamily, fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.5 },
  titleLarge: { fontFamily: systemFontFamily, fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.25 },
  titleMedium: { fontFamily: systemFontFamily, fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.1 },
  titleSmall: { fontFamily: systemFontFamily, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: 0 },
  bodyLarge: { fontFamily: systemFontFamily, fontSize: 17, lineHeight: 25, fontWeight: "400", letterSpacing: 0 },
  body: { fontFamily: systemFontFamily, fontSize: 15, lineHeight: 22, fontWeight: "400", letterSpacing: 0 },
  bodyStrong: { fontFamily: systemFontFamily, fontSize: 15, lineHeight: 22, fontWeight: "600", letterSpacing: 0 },
  labelLarge: { fontFamily: systemFontFamily, fontSize: 15, lineHeight: 20, fontWeight: "600", letterSpacing: 0.1 },
  label: { fontFamily: systemFontFamily, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.15 },
  caption: { fontFamily: systemFontFamily, fontSize: 12, lineHeight: 17, fontWeight: "400", letterSpacing: 0.1 }
} as const satisfies Record<string, TypographyToken>;

export const motion = {
  duration: {
    instant: 0,
    fast: 120,
    standard: 180,
    deliberate: 240,
    slow: 320
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.2, 0, 0, 1.2]
  },
  pressedScale: 0.98,
  disabledOpacity: 0.52
} as const;

export const layout = {
  minTouchTarget: 48,
  compactTouchTarget: 44,
  screenPadding: 20,
  contentMaxWidth: 720
} as const;

export const designTokens = {
  colors: {
    light: lightColors,
    dark: darkColors
  },
  spacing,
  radii,
  typography,
  motion,
  layout
} as const;
