/**
 * How a scene's on-screen text enters and how large it is, in a Workshop film without narration
 * (Remotion workshop-title-styles.ts draws them). A scene's own choice (meta.title_style,
 * meta.title_size) wins over the film's (payload.video.title_style, title_size).
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
