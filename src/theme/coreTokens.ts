import type { BrandColors } from "./brand";
import { hslChannels, mix, readableOn, rgbChannels } from "./color";
import type { ThemeTokens } from "./tokens";

export const WHITE = "#FFFFFF";
export const DANGER = "#DC2626";

export interface Surfaces {
  background: string;
  foreground: string;
  card: string;
  elevated: string;
  inset: string;
  hover: string;
  border: string;
  mutedForeground: string;
}

/** Tokens shared by both modes once the surfaces are chosen. */
export function coreTokens(brand: BrandColors, s: Surfaces): ThemeTokens {
  const onAccent = readableOn(brand.accent, brand.ink, WHITE);
  const glow = mix(brand.accent, WHITE, 0.3);
  return {
    background: hslChannels(s.background),
    foreground: hslChannels(s.foreground),
    card: hslChannels(s.card),
    "card-foreground": hslChannels(s.foreground),
    popover: hslChannels(s.elevated),
    "popover-foreground": hslChannels(s.foreground),
    "surface-elevated": hslChannels(s.elevated),
    "surface-inset": hslChannels(s.inset),
    primary: hslChannels(brand.accent),
    "primary-foreground": hslChannels(onAccent),
    "primary-glow": hslChannels(glow),
    secondary: hslChannels(s.hover),
    "secondary-foreground": hslChannels(s.foreground),
    muted: hslChannels(s.inset),
    "muted-foreground": hslChannels(s.mutedForeground),
    // shadcn uses `accent` for hover/selected backgrounds: keep it neutral.
    accent: hslChannels(s.hover),
    "accent-foreground": hslChannels(s.foreground),
    destructive: hslChannels(DANGER),
    "destructive-foreground": hslChannels(WHITE),
    border: hslChannels(s.border),
    input: hslChannels(s.border),
    ring: hslChannels(brand.accent),
    "sidebar-background": hslChannels(s.card),
    "sidebar-foreground": hslChannels(s.foreground),
    "sidebar-primary": hslChannels(brand.accent),
    "sidebar-primary-foreground": hslChannels(onAccent),
    "sidebar-accent": hslChannels(s.hover),
    "sidebar-accent-foreground": hslChannels(s.foreground),
    "sidebar-border": hslChannels(s.border),
    "sidebar-ring": hslChannels(brand.accent),
    "gradient-primary": `linear-gradient(135deg, ${brand.accent}, ${glow})`,
    "gradient-success": `linear-gradient(135deg, ${brand.accent}, ${glow})`,
    "gradient-subtle": `linear-gradient(180deg, ${mix(brand.accentSoft, s.background, 0.5)}, ${s.background})`,
  };
}

/** Elevation 0 / 1 / 2. `shadow-card` and `shadow-lg` alias levels 1 and 2. */
export function shadowTokens(
  color: string,
  soft: number,
  strong: number,
): ThemeTokens {
  const c = rgbChannels(color);
  const level1 = `0 1px 2px rgb(${c} / ${soft}), 0 2px 8px rgb(${c} / ${soft})`;
  const level2 = `0 4px 12px rgb(${c} / ${soft * 1.2}), 0 12px 32px rgb(${c} / ${strong})`;
  return {
    "elevation-1": level1,
    "elevation-2": level2,
    "shadow-card": level1,
    "shadow-lg": level2,
  };
}
