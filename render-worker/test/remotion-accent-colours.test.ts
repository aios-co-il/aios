import { describe, expect, test } from "vitest";
import { accentColours } from "../../workers/creative-video/remotion/src/workshop-layout.ts";

/**
 * The brand accent where the Workshop film draws it (workers/creative-video/remotion): the end
 * card's call to action on an accent pill, and the spoken karaoke word over the dark caption box.
 */
describe("accentColours", () => {
  test("a dark brand colour gets white text on its fill (the end card's call to action)", () => {
    expect(accentColours("#0a2540").onFill).toBe("#ffffff");
  });

  test("a light brand colour gets near-black text on its fill", () => {
    expect(accentColours("#0ea5e9").onFill).toBe("#061019");
  });

  test("a dark brand colour is lightened as text over the dark caption box", () => {
    expect(accentColours("#1a237e").text).toBe(
      "color-mix(in srgb, #1a237e 45%, white)",
    );
    expect(accentColours("#08F467").text).toBe("#08F467");
  });

  test("the glow is a valid colour for a three- or six-digit hex", () => {
    expect(accentColours("#0af").glow).toBe("rgba(0, 170, 255, 0.33)");
    expect(accentColours("#0ea5e9").glow).toBe("rgba(14, 165, 233, 0.33)");
  });
});
