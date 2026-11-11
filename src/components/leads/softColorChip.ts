import type { CSSProperties } from "react";

/**
 * A soft chip in a colour the user chose for a status, stage or tag: a light
 * tint and border of that colour behind theme text. `color-mix` takes any CSS
 * colour the settings store and keeps the text readable on light and dark
 * cards, where white or coloured text on a saturated fill would not be.
 */
export function softColorChipStyle(
  color: string | null | undefined,
): CSSProperties | undefined {
  if (!color) {
    return undefined;
  }
  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
  };
}
