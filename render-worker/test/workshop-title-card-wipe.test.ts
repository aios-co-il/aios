import { describe, expect, test } from "vitest";
import {
  WIPER,
  WIPE_FRAMES,
  titleCardWipe,
} from "../../workers/creative-video/remotion/src/workshop-title-card-wipe.ts";

/**
 * The title card's entrance over motion captions (workers/creative-video/remotion). On Staging
 * (5 Nov) the accent bar first grew over the whole card, so a frame of each scene (11.2 s in that
 * film) showed a solid accent box with no title in it.
 */
describe("titleCardWipe", () => {
  const frames = Array.from({ length: WIPE_FRAMES + 4 }, (_, t) => t);

  test("the accent never covers more than the wiper's width of the card", () => {
    for (const t of frames) {
      const wipe = titleCardWipe(t);
      expect(wipe.barTo - wipe.barFrom).toBeLessThanOrEqual(WIPER + 1e-9);
    }
  });

  test("the title is uncovered right behind the wiper, from the right", () => {
    for (const t of frames) {
      const wipe = titleCardWipe(t);
      expect(wipe.shown).toBe(wipe.barTo);
    }
    // Eight frames in, where Staging showed an empty box, most of the title already reads.
    expect(titleCardWipe(8).barFrom).toBeGreaterThan(0.6);
  });

  test("nothing before the card starts, and the whole title once the wiper has left", () => {
    expect(titleCardWipe(0)).toEqual({ shown: 0, barFrom: 0, barTo: 0 });
    expect(titleCardWipe(WIPE_FRAMES)).toEqual({
      shown: 1,
      barFrom: 1,
      barTo: 1,
    });
  });
});
