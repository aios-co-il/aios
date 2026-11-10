/**
 * Brand inputs. Every color in the app is derived from these five values in
 * `tokens.ts`, so a tenant (white label) only supplies its own `BrandColors`.
 */
export interface BrandColors {
  /** Main dark color: text, dark surfaces. */
  ink: string;
  /** Action color: primary buttons, focus rings, active states. */
  accent: string;
  /** Soft tint of the accent: success and "active" surfaces. */
  accentSoft: string;
  /** Quiet secondary color: drafts, inactive states. */
  neutral: string;
  /** Rare highlight: "in progress" and notification dots. */
  highlight: string;
}

/** AIOS / Carmen brand. */
export const AIOS_BRAND: BrandColors = {
  ink: "#0A1526",
  // The logo's green; the brand book's neon #08F467 read too loud on screens.
  accent: "#40CE80",
  accentSoft: "#E3FAE0",
  neutral: "#B9C0CC",
  highlight: "#F5F64A",
};

/** Palettes a tenant can pick in branding settings (`tenant_settings.branding.colorPalette`). */
export const BRAND_PRESETS = {
  default: AIOS_BRAND,
  // Saved by tenants before the rebrand; it was the old green default.
  "green-gradient": AIOS_BRAND,
  blue: { ...AIOS_BRAND, accent: "#3B82F6", accentSoft: "#E3EDFD" },
  purple: { ...AIOS_BRAND, accent: "#A855F7", accentSoft: "#F1E6FE" },
  orange: { ...AIOS_BRAND, accent: "#FB923C", accentSoft: "#FFEEDF" },
} satisfies Record<string, BrandColors>;

export type ColorPalette = keyof typeof BRAND_PRESETS;
