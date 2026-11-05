import { expect, test } from "vitest";
import {
  getCharacterRefUrl,
  getStillModel,
  sanitizeVideoStillPrompt,
} from "./videoStill.ts";

test("studio names are replaced and the no-text rule is appended", () => {
  const out = sanitizeVideoStillPrompt(
    "ART DIRECTION: stylized 3D animation still, Pixar/DreamWorks quality. A Disney-style fox.",
  );
  expect(out).not.toMatch(/pixar|disney|dreamworks/i);
  expect(out).toMatch(/No text, no letters, no logos\.$/);
});

test("video settings read from payload.video with safe defaults", () => {
  expect(getStillModel(null)).toBe("gpt-image-2.5-sunburst");
  expect(getStillModel({ video: { still_model: "nano-banana-pro" } })).toBe(
    "nano-banana-pro",
  );
  expect(getStillModel({ video: { still_model: "other" } })).toBe(
    "gpt-image-2.5-sunburst",
  );
  expect(
    getCharacterRefUrl({ video: { character_ref_url: "https://x/c.png" } }),
  ).toBe("https://x/c.png");
  expect(getCharacterRefUrl({ video: {} })).toBe(undefined);
});
