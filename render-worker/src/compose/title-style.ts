/**
 * How a scene's on-screen text enters and how large it is, in a Workshop film without narration
 * (Remotion workshop-title-styles.ts draws them), and the film's font (payload.video.font,
 * Remotion workshop-fonts.ts). A scene's own choice (meta.title_style, meta.title_size) wins over
 * the film's (payload.video.title_style, title_size).
 */

export const TITLE_STYLES = [
  "float",
  "pop",
  "typewriter",
  "slide",
  "reveal",
  "punch",
  "blur",
];

export const TITLE_SIZES = ["small", "medium", "large", "huge"];

/** A known title style, or null. */
export const titleStyleOf = (value) =>
  TITLE_STYLES.includes(value) ? value : null;

/** A known title size, or null. */
export const titleSizeOf = (value) =>
  TITLE_SIZES.includes(value) ? value : null;

/**
 * How a title's key words (numbers, prices, dates) are emphasised once in (Remotion
 * workshop-title-emphasis.ts): the scene's meta.title_emphasis over the film's
 * payload.video.title_emphasis.
 */
export const TITLE_EMPHASES = [
  "none",
  "count",
  "underline",
  "circle",
  "stamp",
  "marker",
  "shake",
];

/** A known title emphasis, or null. */
export const titleEmphasisOf = (value) =>
  TITLE_EMPHASES.includes(value) ? value : null;

/** The keys of the film fonts (Remotion workshop-fonts.ts). */
export const FILM_FONTS = [
  "heebo",
  "rubik",
  "assistant",
  "secular-one",
  "suez-one",
  "frank-ruhl-libre",
];

/** A known film font, or null. */
export const filmFontOf = (value) =>
  FILM_FONTS.includes(value) ? value : null;
