import { describe, expect, test } from "vitest";
import { textlessMotion } from "../src/providers/textless-motion.mjs";

describe("textlessMotion", () => {
  test("drops the sentences that ask the video model for text (Staging, 2 Nov)", () => {
    const motion =
      "Real underwater character animation: the group of four divers swims joyfully, making the OK hand signal; several streams of bubbles rise. The Hebrew overlay text floats with gentle buoyancy. Avoid camera-only motion.";
    expect(textlessMotion(motion)).toBe(
      "Real underwater character animation: the group of four divers swims joyfully, making the OK hand signal; several streams of bubbles rise. Avoid camera-only motion.",
    );
  });

  test("keeps the rest of a clause list when one clause asks for text", () => {
    expect(
      textlessMotion(
        "Divers swim side by side; keep the caption floating steadily; fish swim around them.",
      ),
    ).toBe("Divers swim side by side; fish swim around them.");
  });

  test("drops a Hebrew request for text too", () => {
    expect(textlessMotion("Bubbles rise. הטקסט צף במים.")).toBe(
      "Bubbles rise.",
    );
  });

  test("leaves motion without text unchanged", () => {
    expect(textlessMotion("Slow push-in, she turns to the camera.")).toBe(
      "Slow push-in, she turns to the camera.",
    );
    expect(textlessMotion(null)).toBe("");
  });
});
