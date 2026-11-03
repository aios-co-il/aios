/**
 * What every end-card design (workshop-end-card.tsx) shares: the designs Carmen can choose, the
 * call to action's lines and the size that fits them. No Remotion import, so it is tested
 * without rendering.
 */
import type { WorkshopBrand } from "./manifest";

/** The designs, in the order Carmen's tools list them (render-worker film-look.mjs). */
export const END_CARD_STYLES = ["classic", "bold", "minimal", "split"] as const;

export type EndCardStyle = (typeof END_CARD_STYLES)[number];

export const isEndCardStyle = (value: unknown): value is EndCardStyle =>
  typeof value === "string" &&
  (END_CARD_STYLES as readonly string[]).includes(value);

/** What each design is drawn from. */
export type EndCardProps = {
  brand: WorkshopBrand;
  accent: string;
  fontFamily: string;
  /** The design paints its own ground (the "plain" background); else a background shows. */
  ground: boolean;
  /** The logo and call to action sit on frosted glass (workshop-end-card-glass-panel.tsx). */
  glass: boolean;
};

/** Width of a bold Hebrew glyph in ems, on average (render-worker compose/end-card.mjs). */
const GLYPH_EM = 0.56;

/** The call to action's lines: wrapped by the render worker, else the text on one line. */
export const ctaLinesOf = (brand: WorkshopBrand): string[] =>
  brand.ctaLines?.length
    ? brand.ctaLines.slice(0, 3)
    : brand.ctaText
      ? [brand.ctaText]
      : [];

/**
 * The call to action's size: `maxPx` for a short line, smaller as its longest line grows, so a
 * whole sentence still fits its (up to three) lines across `boxWidth` px (ctaFontPx in
 * end-card.mjs).
 */
export const ctaFontSize = (
  lines: string[],
  boxWidth: number,
  maxPx: number,
) => {
  const longest = Math.max(1, ...lines.map((line) => line.length));
  return Math.max(
    16,
    Math.floor(Math.min(maxPx, boxWidth / (longest * GLYPH_EM))),
  );
};
