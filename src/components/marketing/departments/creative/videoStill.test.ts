import assert from "node:assert/strict";
import test from "node:test";
import {
  getCharacterRefUrl,
  getStillModel,
  sanitizeVideoStillPrompt,
} from "./videoStill.ts";

test("studio names are replaced and the no-text rule is appended", () => {
  const out = sanitizeVideoStillPrompt(
    "ART DIRECTION: stylized 3D animation still, Pixar/DreamWorks quality. A Disney-style fox.",
  );
  assert.doesNotMatch(out, /pixar|disney|dreamworks/i);
  assert.match(out, /No text, no letters, no logos\.$/);
});

test("video settings read from payload.video with safe defaults", () => {
  assert.equal(getStillModel(null), "gpt-image-2.5-sunburst");
  assert.equal(
    getStillModel({ video: { still_model: "nano-banana-pro" } }),
    "nano-banana-pro",
  );
  assert.equal(
    getStillModel({ video: { still_model: "other" } }),
    "gpt-image-2.5-sunburst",
  );
  assert.equal(
    getCharacterRefUrl({ video: { character_ref_url: "https://x/c.png" } }),
    "https://x/c.png",
  );
  assert.equal(getCharacterRefUrl({ video: {} }), undefined);
});
