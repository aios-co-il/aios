/** One cell of the "magic" loading field: a grid of pixels lit by three crossing waves. */
export interface ShimmerCell {
  hue: number;
  lightness: number;
  alpha: number;
}

export function shimmerCell(
  col: number,
  row: number,
  cols: number,
  rows: number,
  t: number,
): ShimmerCell {
  const nx = cols > 1 ? col / (cols - 1) : 0;
  const ny = rows > 1 ? row / (rows - 1) : 0;
  const diagonal = Math.sin((nx * 3 + ny * 2) * Math.PI - t * 1.1);
  const cross = Math.sin((-nx * 2 + ny * 4) * Math.PI + t * 0.8);
  const ripple = Math.sin(Math.hypot(nx - 0.5, ny - 0.5) * 9 - t * 1.6);
  const energy = Math.pow(((diagonal + cross + ripple) / 3 + 1) / 2, 1.6);
  const hue = (((285 + 80 * nx - 40 * ny + 30 * cross) % 360) + 360) % 360;
  return {
    hue,
    lightness: 26 + 44 * energy,
    alpha: 0.22 + 0.78 * energy,
  };
}

export const ASPECT_RATIOS: Record<string, number> = {
  "9:16": 9 / 16,
  "4:5": 4 / 5,
  "1:1": 1,
  "16:9": 16 / 9,
};

export const aspectRatioOf = (format: unknown, fallback = "4:5") =>
  ASPECT_RATIOS[String(format)] ?? ASPECT_RATIOS[fallback];
