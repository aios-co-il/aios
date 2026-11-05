import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  WORKSHOP_TRANSITIONS,
  enterStyle,
  transitionLook,
} from "../../workers/creative-video/remotion/src/workshop-transitions.ts";
import {
  END_CARD_STYLES,
  ctaFontSize,
  isEndCardStyle,
} from "../../workers/creative-video/remotion/src/workshop-end-card-layout.ts";
import {
  END_CARD_STYLES as WORKER_END_CARDS,
  SCENE_TRANSITIONS as WORKER_TRANSITIONS,
} from "../src/compose/film-look.ts";

const JOB = readFileSync(
  new URL(
    "../../workers/creative-video/remotion/render-job.mjs",
    import.meta.url,
  ),
  "utf8",
);

/** The scene `frame` frames into a 12-frame entrance of `type`, in a 60-frame picture. */
const entering = (type, frame) =>
  transitionLook({
    type,
    enter: 12,
    exitFrames: 0,
    frame,
    total: 60,
    width: 1080,
    id: "fx-a",
  });

/** The outgoing scene `frame` frames into the next one's 12-frame entrance of `type`. */
const leaving = (type, frame) =>
  transitionLook({
    type: "cut",
    enter: 0,
    exitType: type,
    exitFrames: 12,
    frame: 48 + frame,
    total: 60,
    width: 1080,
    id: "fx-a",
  });

/** The transitions between scenes and the closing card's designs (Remotion). */
describe("transitions and end cards", () => {
  test("the film knows every transition the worker passes, plus its own skin switch", () => {
    expect(WORKSHOP_TRANSITIONS.filter((t) => t !== "skin")).toEqual(
      WORKER_TRANSITIONS,
    );
    expect([...END_CARD_STYLES]).toEqual(WORKER_END_CARDS);
    // render-job.mjs lets each of them through.
    for (const name of [...WORKSHOP_TRANSITIONS, ...END_CARD_STYLES])
      expect(JOB).toContain(`"${name}"`);
  });

  test("every transition ends at rest, with no filter left on the picture", () => {
    for (const type of WORKSHOP_TRANSITIONS) {
      expect(entering(type, 12)).toStrictEqual({ style: {}, fx: null });
      expect(entering(type, 40)).toStrictEqual({ style: {}, fx: null });
      expect(leaving(type, -1)).toStrictEqual({ style: {}, fx: null });
    }
  });

  test("whip, ripple and glitch move the picture through their filter mid-way", () => {
    const whip = entering("whip", 6);
    expect(whip.fx.blur).toBeGreaterThan(20);
    expect(whip.style.filter).toBe("url(#fx-a)");
    expect(whip.style.transform).toMatch(/^translateX\(-/);
    // The outgoing picture is pushed out the other way.
    expect(leaving("whip", 6).style.transform).toMatch(/^translateX\(\d/);
    const ripple = entering("ripple", 4);
    expect(ripple.fx.ripple).toBeGreaterThan(20);
    expect(ripple.style.maskImage).toMatch(/^radial-gradient/);
    const glitch = entering("glitch", 2);
    expect(glitch.fx.split).toBeGreaterThan(5);
    expect(glitch.fx.slice).toBeGreaterThan(5);
    expect(leaving("glitch", 10).fx.split).toBeGreaterThan(5);
  });

  test("each transition starts from where it should", () => {
    expect(entering("ripple", 0).style.maskImage).toContain("#000 0.0%");
    expect(entering("whip", 0).style.transform).toBe("translateX(-100.00%)");
    expect(enterStyle("crossfade", 0, 12)).toStrictEqual({ opacity: 0 });
    expect(enterStyle("wipe", 0, 12).clipPath).toBe("inset(0 0 0 100%)");
    expect(enterStyle("slide", 0, 12).transform).toBe("translateX(-100%)");
    expect(entering("cut", 0)).toStrictEqual({ style: {}, fx: null });
    expect(entering("skin", 0)).toStrictEqual({ style: {}, fx: null });
  });

  test("end-card names are checked and a long call to action shrinks to fit", () => {
    expect(isEndCardStyle("split")).toBe(true);
    expect(isEndCardStyle("neon")).toBe(false);
    const lines = ["לרגל החזרה לפעילות –", "20% הנחה על השכרת ציוד"];
    const size = ctaFontSize(lines, 600, 200);
    const longest = Math.max(...lines.map((line) => line.length));
    expect(size).toBeLessThan(200);
    expect(size * 0.56 * longest).toBeLessThanOrEqual(600);
    expect(ctaFontSize(["קצר"], 600, 80)).toBe(80);
  });
});
