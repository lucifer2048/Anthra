import type { ImageSourcePropType } from "react-native";
import type { SemanticColors } from "./tokens";

export type ScreenBackgroundToken = {
  /** Full-bleed solid fill behind safe content. */
  color?: string;
  /** Optional linear gradient over the solid fill (top → bottom by default). */
  gradient?: {
    colors: string[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    locations?: number[];
  };
  /** Optional full-bleed image. */
  image?: ImageSourcePropType;
  imageResizeMode?: "cover" | "contain" | "stretch" | "repeat" | "center";
  /** Soft decorative circle tint (brand wash). */
  withBgCircle?: boolean;
  circleColor?: string;
};

/**
 * Theme-aware screen backgrounds. Prefer spreading these into `ScreenLayout`.
 */
export function createScreenBackgrounds(colors: SemanticColors): {
  canvas: ScreenBackgroundToken;
  surface: ScreenBackgroundToken;
  brandWash: ScreenBackgroundToken;
} {
  return {
    /** Default app canvas — use on almost every screen. */
    canvas: {
      color: colors.canvas
    },
    /** Elevated surface fill (rare: sheet-like full screens). */
    surface: {
      color: colors.surface
    },
    /** Canvas with a soft brand radial wash (hub / marketing-feel screens). */
    brandWash: {
      color: colors.canvas,
      gradient: {
        colors: [colors.brandSoft, colors.canvas, colors.canvas],
        start: { x: 0.5, y: 0 },
        end: { x: 0.5, y: 0.55 },
        locations: [0, 0.45, 1]
      },
      withBgCircle: true,
      circleColor: colors.brandSoft
    }
  };
}

export type AnthraScreenBackgrounds = ReturnType<typeof createScreenBackgrounds>;
