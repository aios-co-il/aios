/**
 * The title card's entrance (workshop-title-card.tsx) as pure numbers per frame: a short accent
 * wiper crosses the card from the right, Hebrew's reading side, and the title is uncovered right
 * behind it. On Staging (5 Nov) the bar first grew over the whole card and only then pulled back,
 * so for about ten frames each scene showed a solid accent box with no title in it.
 */

/** Frames the wiper takes to cross the card. */
export const WIPE_FRAMES = 12;
/** The wiper's width, as a share of the card. */
export const WIPER = 0.18;

/** Where the wiper and the uncovered title are, as shares of the card measured from its right. */
export type TitleCardWipe = {
  /** How much of the title is uncovered, from the right. */
  shown: number;
  /** The wiper's right and left edges; equal when it is not on the card. */
  barFrom: number;
  barTo: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Cubic ease in and out; the title card's exit (workshop-title-card.tsx) uses it too. */
export const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;

/** The wipe `t` frames into the card: the title is uncovered up to the wiper's leading edge. */
export function titleCardWipe(t: number): TitleCardWipe {
  // The leading edge runs one wiper's width past the card, so the wiper leaves it whole.
  const edge = easeInOut(clamp01(t / WIPE_FRAMES)) * (1 + WIPER);
  return {
    shown: clamp01(edge),
    barFrom: clamp01(edge - WIPER),
    barTo: clamp01(edge),
  };
}
