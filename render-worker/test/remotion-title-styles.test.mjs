import { describe, expect, test } from "vitest";
import {
  SIZE_SCALE,
  TITLE_SIZES,
  TITLE_STYLES,
  isTitleSize,
  isTitleStyle,
  wordLook,
} from "../../workers/creative-video/remotion/src/workshop-title-styles.ts";
import {
  TITLE_SIZES as WORKER_SIZES,
  TITLE_STYLES as WORKER_STYLES,
} from "../src/compose/title-style.mjs";
import {
  TITLE_SIZES as CARMEN_SIZES,
  TITLE_STYLES as CARMEN_STYLES,
} from "../../supabase/functions/_shared/workshop/title-styles.ts";

/** The styles a scene's text can enter in (workers/creative-video/remotion). */
describe("title styles", () => {
  test("Carmen, the worker and the film know the same styles and sizes", () => {
    expect(WORKER_STYLES).toEqual([...TITLE_STYLES]);
    expect(WORKER_SIZES).toEqual([...TITLE_SIZES]);
    expect([...CARMEN_STYLES]).toEqual([...TITLE_STYLES]);
    expect([...CARMEN_SIZES]).toEqual([...TITLE_SIZES]);
  });

  test("every style hides a word before it enters and rests once it is in", () => {
    for (const style of TITLE_STYLES) {
      expect(wordLook(style, -1, 0)).toMatchObject({ opacity: 0, shown: 0 });
      const rest = wordLook(style, 60, 1);
      const still = {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        rotate: 0,
        blur: 0,
        shown: 1,
      };
      for (const [key, value] of Object.entries(still)) {
        expect(rest[key]).toBeCloseTo(value, 9);
      }
    }
  });

  test("each style starts its word in its own way", () => {
    expect(wordLook("pop", 0, 0).scale).toBe(0);
    expect(wordLook("typewriter", 0, 0).shown).toBe(0);
    expect(wordLook("slide", 0, 0).x).toBeGreaterThan(1);
    expect(wordLook("reveal", 0, 0).y).toBeGreaterThan(1);
    expect(wordLook("punch", 0, 0).scale).toBeGreaterThan(2);
    expect(wordLook("blur", 0, 0).blur).toBeGreaterThan(10);
    expect(wordLook("float", 0, 0).scale).toBeLessThan(1);
  });

  test("names are checked and sizes scale around the captions' size", () => {
    expect(isTitleStyle("pop")).toBe(true);
    expect(isTitleStyle("spin")).toBe(false);
    expect(isTitleSize("huge")).toBe(true);
    expect(isTitleSize("tiny")).toBe(false);
    expect(SIZE_SCALE.medium).toBe(1);
    expect(SIZE_SCALE.small).toBeLessThan(1);
    expect(SIZE_SCALE.huge).toBeGreaterThan(SIZE_SCALE.large);
  });
});
