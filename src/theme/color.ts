/** Pure color math for the theme engine. Inputs are `#RRGGBB` hex strings. */

type Rgb = { r: number; g: number; b: number };

const HEX_PATTERN = /^#([0-9a-f]{6})$/i;

/** True for `#RRGGBB` strings. */
export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value);
}

/** Parses `#RRGGBB`; throws on anything else so bad brand input is loud. */
function hexToRgb(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex);
  if (!match) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** Formats channels as uppercase `#RRGGBB`. */
function rgbToHex({ r, g, b }: Rgb): string {
  return `#${hexPart(r)}${hexPart(g)}${hexPart(b)}`.toUpperCase();
}

/** One channel as two hex digits. */
function hexPart(n: number): string {
  return Math.round(n).toString(16).padStart(2, "0");
}

/** `weight` is the share of `b`: 0 returns `a`, 1 returns `b`. */
export function mix(a: string, b: string, weight: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({
    r: x.r + (y.r - x.r) * weight,
    g: x.g + (y.g - x.g) * weight,
    b: x.b + (y.b - x.b) * weight,
  });
}

/** Space-separated HSL channels, the format the CSS variables use: `209 59% 10%`. */
export function hslChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : hue(rn, gn, bn, max, d);
  return `${round1(h)} ${round1(s * 100)}% ${round1(l * 100)}%`;
}

/** Hue in degrees for a non-gray color. */
function hue(rn: number, gn: number, bn: number, max: number, d: number) {
  let sector: number;
  if (max === rn) {
    sector = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    sector = (bn - rn) / d + 2;
  } else {
    sector = (rn - gn) / d + 4;
  }
  const degrees = sector * 60;
  return degrees < 0 ? degrees + 360 : degrees;
}

/** Rounds to one decimal place. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Space-separated RGB channels for `rgb(... / alpha)` shadows. */
export function rgbChannels(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** sRGB channel (0–255) to linear light. */
function linear(n: number): number {
  const c = n / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks whichever of `dark` / `light` reads better on `background`. */
export function readableOn(
  background: string,
  dark: string,
  light: string,
): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light)
    ? dark
    : light;
}
