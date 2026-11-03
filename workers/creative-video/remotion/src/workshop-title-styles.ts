/**
 * How one word of a scene's motion title (workshop-motion-title.tsx) enters, for each style
 * Carmen can choose. Pure numbers per frame, so every style is tested without rendering.
 */

/** The styles, in the order Carmen's tools list them (render-worker title-style.mjs). */
export const TITLE_STYLES = [
  "float",
  "pop",
  "typewriter",
  "slide",
  "reveal",
  "punch",
  "blur",
] as const;

export type TitleStyle = (typeof TITLE_STYLES)[number];

export const isTitleStyle = (value: unknown): value is TitleStyle =>
  typeof value === "string" &&
  (TITLE_STYLES as readonly string[]).includes(value);

/** One word's look at a frame: offsets in ems, blur in px, `shown` the revealed share (0–1). */
export type WordLook = {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  blur: number;
  shown: number;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * A word `t` frames after it starts entering; `p` is its spring (0 to 1, with overshoot for the
 * bouncy styles). Before it starts (t < 0) it keeps its place, invisible.
 */
export function wordLook(style: TitleStyle, t: number, p: number): WordLook {
  const still = {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    blur: 0,
    shown: 1,
  };
  if (t < 0) {
    return { ...still, opacity: 0, shown: 0 };
  }
  const fade = (frames: number) => clamp01(t / frames);
  switch (style) {
    case "pop":
      // Grows from nothing past its size and settles (the spring overshoots).
      return { ...still, opacity: fade(2), scale: p };
    case "typewriter":
      // Typed in from its first letter: revealed from the reading side, no motion.
      return { ...still, shown: fade(6) };
    case "slide":
      // Slides in from the side Hebrew reads from.
      return { ...still, opacity: fade(4), x: (1 - p) * 1.4 };
    case "reveal":
      // Rises out of a mask under its line.
      return { ...still, y: (1 - p) * 1.1 };
    case "punch":
      // Slams down from large, a hard beat for an offer or a number.
      return {
        ...still,
        opacity: fade(2),
        scale: 2.2 - 1.2 * p,
        blur: (1 - fade(4)) * 8,
      };
    case "blur":
      // Comes into focus where it stands.
      return { ...still, opacity: fade(8), blur: (1 - fade(10)) * 16 };
    case "float":
    default:
      // Rises, grows and sharpens; the whole text then floats (workshop-motion-title.tsx).
      return {
        ...still,
        opacity: fade(4),
        y: (1 - p) * 0.6,
        scale: 0.6 + 0.4 * p,
        blur: (1 - fade(5)) * 10,
      };
  }
}

/** Spring settings per style: the bouncy ones overshoot. */
export const SPRING_OF: Record<
  TitleStyle,
  { damping: number; mass: number; stiffness: number }
> = {
  float: { damping: 13, mass: 0.5, stiffness: 160 },
  pop: { damping: 8, mass: 0.5, stiffness: 200 },
  typewriter: { damping: 20, mass: 0.5, stiffness: 200 },
  slide: { damping: 16, mass: 0.5, stiffness: 170 },
  reveal: { damping: 15, mass: 0.5, stiffness: 180 },
  punch: { damping: 12, mass: 0.6, stiffness: 260 },
  blur: { damping: 20, mass: 0.5, stiffness: 150 },
};

/** Only the float style floats as a whole; the others hold still once in. */
export const floats = (style: TitleStyle) => style === "float";

/** How large the scene's text is drawn, against the captions' size. */
export const TITLE_SIZES = ["small", "medium", "large", "huge"] as const;

export type TitleSize = (typeof TITLE_SIZES)[number];

export const isTitleSize = (value: unknown): value is TitleSize =>
  typeof value === "string" &&
  (TITLE_SIZES as readonly string[]).includes(value);

/** The font size factor of each size; "medium" is the captions' own size. */
export const SIZE_SCALE: Record<TitleSize, number> = {
  small: 0.75,
  medium: 1,
  large: 1.3,
  huge: 1.65,
};
