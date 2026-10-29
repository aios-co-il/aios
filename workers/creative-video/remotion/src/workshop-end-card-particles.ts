/**
 * The particles background's soft floating lights (bokeh), as pure numbers per frame. They are
 * drawn from a fixed seed, never Math.random, so every frame of every render is the same.
 */

/** At most this many lights: each is a gradient circle, and the card must stay cheap to draw. */
export const MAX_PARTICLES = 60;

/**
 * A light: centre as fractions of the frame, radius as a fraction of its shorter side, how bright
 * it is, and its colour (0: accent, 1: the brand's second colour, 2: white).
 */
export type Particle = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  colour: 0 | 1 | 2;
};

/** mulberry32: a small seeded generator of numbers in [0, 1). */
const seeded = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fades a light in and out near the top and bottom, so its wrap-around never pops. */
const edge = (y: number) => Math.min(1, y / 0.12, (1 - y) / 0.12);

/**
 * The lights at `frame`: each rises at its own pace, sways a little and twinkles, and comes back
 * in at the bottom after leaving at the top. Bigger lights are fainter, like out-of-focus bokeh.
 */
export function particlesAt(
  frame: number,
  count = 44,
  seed = 7,
  fps = 30,
): Particle[] {
  const next = seeded(seed);
  const t = frame / fps;
  return Array.from({ length: Math.min(MAX_PARTICLES, count) }, (_, i) => {
    const [x0, y0, size, speed, phase] = [
      next(),
      next(),
      next(),
      next(),
      next(),
    ];
    const r = 0.006 + size * size * 0.07;
    const y = (((y0 - t * (0.012 + speed * 0.03)) % 1) + 1) % 1;
    const sway = 0.02 * Math.sin(t * 0.6 + phase * 6.28);
    const x = Math.min(1, Math.max(0, x0 + sway));
    const twinkle = 0.75 + 0.25 * Math.sin(t * (1 + speed) + phase * 6.28);
    const opacity = (0.95 - size * 0.5) * twinkle * Math.max(0, edge(y));
    return { x, y, r, opacity, colour: (i % 3) as 0 | 1 | 2 };
  });
}
