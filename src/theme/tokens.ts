import type { BrandColors } from "./brand";
import { hslChannels, mix } from "./color";
import { darkTokens, lightTokens } from "./modeTokens";

export type ThemeMode = "light" | "dark";

/** CSS variable name (without `--`) → value. */
export type ThemeTokens = Record<string, string>;

/**
 * Derives every semantic token the app uses from five brand colors.
 * Components only reference these tokens (via Tailwind), never raw colors.
 */
export function buildThemeTokens(
  brand: BrandColors,
  mode: ThemeMode,
): ThemeTokens {
  return {
    ...brandTokens(brand),
    ...(mode === "light" ? lightTokens(brand) : darkTokens(brand)),
    ...shapeTokens(),
  };
}

/** Raw brand colors, for the few places that need the brand itself. */
function brandTokens(brand: BrandColors): ThemeTokens {
  return {
    "brand-ink": hslChannels(brand.ink),
    "brand-accent": hslChannels(brand.accent),
    "brand-accent-soft": hslChannels(brand.accentSoft),
    "brand-neutral": hslChannels(brand.neutral),
    "brand-highlight": hslChannels(brand.highlight),
    // A softer, mint version of the accent for large display type.
    "brand-mint": hslChannels(
      mix(mix(brand.accent, brand.neutral, 0.35), brand.ink, 0.1),
    ),
    ...accentScale(brand),
  };
}

/** Accent scale step → share of white (negative: share of ink) mixed in. */
const ACCENT_MIX = {
  50: 0.92,
  100: 0.84,
  200: 0.68,
  300: 0.45,
  400: 0.2,
  500: 0,
  600: -0.35,
  700: -0.5,
  800: -0.62,
  900: -0.74,
  950: -0.86,
};

export const ACCENT_STEPS = Object.keys(ACCENT_MIX).map(Number);

/**
 * Tailwind-style 50–950 steps of the accent. Dark steps mix toward ink, so
 * 600+ stays readable as text on light surfaces even for a very bright accent.
 */
function accentScale(brand: BrandColors): ThemeTokens {
  return Object.fromEntries(
    Object.entries(ACCENT_MIX).map(([step, weight]) => {
      const target = weight < 0 ? brand.ink : "#FFFFFF";
      const hex = mix(brand.accent, target, Math.abs(weight));
      return [`brand-accent-${step}`, hslChannels(hex)];
    }),
  );
}

/** Radius scale 8 / 12 / 16 px. */
function shapeTokens(): ThemeTokens {
  return {
    radius: "1rem",
    "radius-md": "0.75rem",
    "radius-sm": "0.5rem",
  };
}
