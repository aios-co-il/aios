const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Turns user input such as `F60`, `#3B82F6` or ` 3b82f6 ` into a lowercase
 * `#rrggbb` string, or `null` when the input is not a 3- or 6-digit hex color.
 */
export function normalizeHex(input: string): string | null {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) {
    return null;
  }
  const digits = match[1].toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return `#${full}`;
}
