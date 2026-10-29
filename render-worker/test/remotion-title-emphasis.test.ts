import { describe, expect, test } from "vitest";
import {
  EMPHASIS_FRAMES,
  EMPHASIS_LAG,
  STAMP_TILT,
  TITLE_EMPHASES,
  countText,
  countable,
  emphasisLook,
  emphasisStart,
  isTitleEmphasis,
} from "../../workers/creative-video/remotion/src/workshop-title-emphasis.ts";
import { TITLE_EXIT } from "../../workers/creative-video/remotion/src/workshop-title-timing.ts";
import { TITLE_EMPHASES as WORKER_EMPHASES } from "../src/compose/title-style.ts";
import { TITLE_EMPHASES as CARMEN_EMPHASES } from "../../supabase/functions/_shared/workshop/title-emphasis.ts";

/** How a motion title's key words are emphasised once in (workers/creative-video/remotion). */
describe("title emphasis", () => {
  test("Carmen, the worker and the film know the same effects", () => {
    expect(WORKER_EMPHASES).toEqual([...TITLE_EMPHASES]);
    expect([...CARMEN_EMPHASES]).toEqual([...TITLE_EMPHASES]);
    expect(isTitleEmphasis("stamp")).toBe(true);
    expect(isTitleEmphasis("sparkle")).toBe(false);
  });

  test("nothing is drawn before the emphasis starts", () => {
    for (const effect of TITLE_EMPHASES) {
      const look = emphasisLook(effect, -1);
      expect(look).toMatchObject({ line: 0, marker: 0, box: 0, x: 0, y: 0 });
      expect(look.scale).toBe(1);
      expect(look.rotate).toBe(0);
    }
    expect(emphasisLook("count", -1).count).toBe(0);
  });

  test("each effect ends in its own resting look", () => {
    const rest = (effect) => emphasisLook(effect, 60);
    expect(rest("none")).toMatchObject({ line: 0, marker: 0, box: 0 });
    expect(rest("count").count).toBe(1);
    expect(rest("underline").line).toBe(1);
    expect(rest("circle").line).toBe(1);
    expect(rest("marker").marker).toBe(1);
    expect(rest("stamp")).toMatchObject({ box: 1, rotate: STAMP_TILT });
    expect(rest("stamp").scale).toBeCloseTo(1, 9);
    expect(rest("shake").x).toBeCloseTo(0, 9);
    expect(rest("shake").rotate).toBeCloseTo(0, 9);
  });

  test("each effect moves in its own way on the way there", () => {
    expect(emphasisLook("count", 6).count).toBeGreaterThan(0.3);
    expect(emphasisLook("count", 6).count).toBeLessThan(1);
    expect(emphasisLook("underline", 4).line).toBeLessThan(1);
    expect(emphasisLook("circle", 4).line).toBeLessThan(
      emphasisLook("circle", 10).line,
    );
    expect(emphasisLook("marker", 3).marker).toBeLessThan(1);
    // The stamp lifts before it lands, then the box appears and it jitters.
    expect(emphasisLook("stamp", 4).scale).toBeGreaterThan(1.2);
    expect(emphasisLook("stamp", 4).box).toBe(0);
    expect(emphasisLook("stamp", 9).box).toBe(1);
    expect(Math.abs(emphasisLook("stamp", 9).x)).toBeGreaterThan(0);
    expect(Math.abs(emphasisLook("shake", 2).rotate)).toBeGreaterThan(1);
  });

  test("the emphasis starts once a word is in and ends before the text leaves", () => {
    expect(emphasisStart(10, 200)).toBe(10 + EMPHASIS_LAG);
    // A key word late in a short scene is emphasised sooner, never before it enters.
    expect(emphasisStart(40, 70)).toBe(70 - TITLE_EXIT - EMPHASIS_FRAMES);
    expect(emphasisStart(60, 70)).toBe(60);
  });
});

describe("countable", () => {
  test("a plain number with a percent or currency sign counts", () => {
    expect(countable("20%")).toMatchObject({
      prefix: "",
      value: 20,
      suffix: "%",
    });
    expect(countable("₪99")).toMatchObject({
      prefix: "₪",
      value: 99,
      suffix: "",
    });
    expect(countable("$49.90")).toMatchObject({ value: 49.9, decimals: 2 });
    expect(countable("1,500₪!")).toMatchObject({
      value: 1500,
      grouped: true,
      suffix: "₪!",
    });
    expect(countable("300")).toMatchObject({ value: 300, decimals: 0 });
  });

  test("dates, times, phones and numbers inside words stay as they are", () => {
    for (const word of ["31.12.26", "31.12", "10:00", "054-1234567", "ב-20%"]) {
      expect(countable(word)).toBeNull();
    }
  });

  test("the count reads from 0 up to the number as written", () => {
    const percent = countable("20%");
    expect(countText(percent, 0)).toBe("0%");
    expect(countText(percent, 0.5)).toBe("10%");
    expect(countText(percent, 1)).toBe("20%");
    expect(countText(countable("₪99"), 0)).toBe("₪0");
    expect(countText(countable("₪99"), 1)).toBe("₪99");
    expect(countText(countable("1,500₪"), 1)).toBe("1,500₪");
    expect(countText(countable("$49.90"), 0)).toBe("$0.00");
  });
});
