import { describe, expect, test } from "vitest";
import {
  TITLE_DELAY,
  TITLE_EXIT,
  TITLE_STAGGER,
  motionTitleWords,
} from "../../workers/creative-video/remotion/src/workshop-title-timing.ts";

/**
 * A scene's on-screen text as motion graphics in a Workshop film without narration
 * (workers/creative-video/remotion): its words enter one after another (Staging, 2 Nov: a film
 * without narration showed its text as a plain caption line).
 */
describe("motionTitleWords", () => {
  test("words enter one after another and numbers are marked", () => {
    const words = motionTitleWords("20% הנחה עד 31.12.26", 120);
    expect(words.map((word) => word.text)).toEqual([
      "20%",
      "הנחה",
      "עד",
      "31.12.26",
    ]);
    expect(words.map((word) => word.at)).toEqual([
      TITLE_DELAY,
      TITLE_DELAY + TITLE_STAGGER,
      TITLE_DELAY + 2 * TITLE_STAGGER,
      TITLE_DELAY + 3 * TITLE_STAGGER,
    ]);
    expect(words.map((word) => word.key)).toEqual([true, false, false, true]);
  });

  test("a long text in a short scene is in before it starts to leave", () => {
    const frames = 40;
    const words = motionTitleWords(
      "לרגל החזרה לפעילות 20% הנחה על השכרת ציוד ללקוחות המועדון עד 31.12.26",
      frames,
    );
    expect(words.at(-1).at).toBeLessThan(frames - TITLE_EXIT);
  });

  test("no text, no words", () => {
    expect(motionTitleWords("   ", 90)).toEqual([]);
  });
});
