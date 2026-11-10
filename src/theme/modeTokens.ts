import type { BrandColors } from "./brand";
import { hslChannels, mix } from "./color";
import { coreTokens, shadowTokens, WHITE, DANGER } from "./coreTokens";
import type { ThemeTokens } from "./tokens";

/**
 * Neutral surfaces stay the same for every tenant so the product reads as one
 * calm, professional system; only the brand colors change per tenant.
 */
const LIGHT_SURFACES = {
  page: "#F6F5F2",
  card: "#FDFCFA",
  elevated: "#FFFFFF",
  inset: "#F1F0EC",
  hover: "#EEEDE9",
  border: "#E4E3DE",
};

/** Light theme: warm neutral surfaces, ink text, accent actions. */
export function lightTokens(brand: BrandColors): ThemeTokens {
  const s = LIGHT_SURFACES;
  const muted = mix(brand.ink, WHITE, 0.36);
  return {
    ...coreTokens(brand, {
      background: s.page,
      foreground: brand.ink,
      card: s.card,
      elevated: s.elevated,
      inset: s.inset,
      hover: s.hover,
      border: s.border,
      mutedForeground: muted,
    }),
    success: hslChannels(brand.accentSoft),
    "success-foreground": hslChannels(brand.ink),
    "surface-status-green": hslChannels(mix(brand.accentSoft, WHITE, 0.5)),
    "surface-status-yellow": hslChannels(mix(brand.highlight, WHITE, 0.88)),
    "surface-status-red": hslChannels(mix(DANGER, WHITE, 0.94)),
    "status-draft": hslChannels(mix(brand.neutral, brand.ink, 0.15)),
    "status-draft-surface": hslChannels(mix(brand.neutral, WHITE, 0.72)),
    "status-active": hslChannels(brand.accent),
    "status-active-surface": hslChannels(brand.accentSoft),
    "status-progress": hslChannels(mix(brand.highlight, brand.ink, 0.12)),
    "status-progress-surface": hslChannels(mix(brand.highlight, WHITE, 0.82)),
    "status-foreground": hslChannels(brand.ink),
    ...shadowTokens(brand.ink, 0.05, 0.08),
  };
}

/** Dark theme: ink surfaces lifted toward white, the same accent. */
export function darkTokens(brand: BrandColors): ThemeTokens {
  const lift = mix.bind(null, brand.ink, WHITE);
  const text = mix(WHITE, brand.ink, 0.04);
  return {
    ...coreTokens(brand, {
      background: brand.ink,
      foreground: text,
      card: lift(0.05),
      elevated: lift(0.08),
      inset: mix(brand.ink, "#000000", 0.18),
      hover: lift(0.1),
      border: lift(0.13),
      mutedForeground: mix(WHITE, brand.ink, 0.38),
    }),
    success: hslChannels(mix(brand.ink, brand.accent, 0.18)),
    "success-foreground": hslChannels(mix(brand.accent, WHITE, 0.35)),
    "surface-status-green": hslChannels(mix(brand.ink, brand.accent, 0.1)),
    "surface-status-yellow": hslChannels(mix(brand.ink, brand.highlight, 0.1)),
    "surface-status-red": hslChannels(mix(brand.ink, DANGER, 0.14)),
    "status-draft": hslChannels(brand.neutral),
    "status-draft-surface": hslChannels(lift(0.08)),
    "status-active": hslChannels(brand.accent),
    "status-active-surface": hslChannels(mix(brand.ink, brand.accent, 0.14)),
    "status-progress": hslChannels(brand.highlight),
    "status-progress-surface": hslChannels(
      mix(brand.ink, brand.highlight, 0.14),
    ),
    "status-foreground": hslChannels(text),
    ...shadowTokens("#000000", 0.25, 0.4),
  };
}
