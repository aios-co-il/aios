import type { MiniMeGender } from "./miniMeGender";

/** Every Mini Me render, by file path: `./images/<skin>-<gender>.webp`. */
const IMAGES = import.meta.glob<string>("./images/*.webp", {
  eager: true,
  import: "default",
});

/**
 * The render of one skin in one set. A skin without a render of its own
 * (or no skin at all) shows the classic Mini Me of that set.
 */
export function miniMeImage(
  skin: string | undefined,
  gender: MiniMeGender,
): string {
  return (
    IMAGES[`./images/${skin}-${gender}.webp`] ??
    IMAGES[`./images/classic-${gender}.webp`]
  );
}
