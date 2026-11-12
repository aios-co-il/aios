/** The glass, feet and hands colors of one Mini Me. */
export type MiniMePalette = {
  light: string;
  mid: string;
  dark: string;
  limb: string;
};

/** The thin dark edge that keeps a prop readable on the glass. */
export const MINI_ME_OUTLINE = {
  stroke: "#0A1526",
  strokeOpacity: 0.35,
  strokeWidth: 2,
};

/** The tenant accent's scale, so an untinted Mini Me follows the brand. */
const BRAND_PALETTE: MiniMePalette = {
  light: "hsl(var(--brand-accent-100))",
  mid: "hsl(var(--brand-accent))",
  dark: "hsl(var(--brand-accent-800))",
  limb: "hsl(var(--brand-accent-600))",
};

/**
 * A Mini Me's colors from a skin tint ("H S% L%", as skin-roles stores it):
 * a pale top light, the tint itself, a deep shade for the feet and a
 * saturated one for the hands. No tint, or one that does not parse, uses
 * the brand accent.
 */
export function miniMePalette(tint?: string | null): MiniMePalette {
  const match = tint?.match(
    /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/,
  );
  if (!match) {
    return BRAND_PALETTE;
  }
  const [hue, saturation, lightness] = match.slice(1).map(Number);
  return {
    light: shade(hue, saturation, 90),
    mid: shade(hue, saturation, lightness),
    dark: shade(hue, saturation, Math.max(lightness * 0.45, 14)),
    limb: shade(hue, saturation, lightness * 0.78),
  };
}

/** One CSS color of the tint at another lightness. */
function shade(hue: number, saturation: number, lightness: number): string {
  return `hsl(${hue} ${saturation}% ${Math.round(lightness)}%)`;
}
