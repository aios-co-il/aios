import assert from "node:assert/strict";
import test from "node:test";
import type { StoryboardFrame } from "./types";
import { buildVideoRenderManifest, VideoRenderValidationError } from "./videoRenderManifest";

const scene = (id: string, order: number, duration: number): StoryboardFrame => ({
  id, order, duration, title: "Scene", shot: "Wide", visualPrompt: "Ocean",
  overlayText: "שלום עולם", voiceover: "קריינות בעברית",
  imageUrl: "https://example.com/scene.png", x: 0, y: 0,
});

test("builds contiguous frames in storyboard order and preserves Hebrew", () => {
  const manifest = buildVideoRenderManifest([scene("b", 2, 1.5), scene("a", 1, 2)], "9:16");
  assert.equal(manifest.width, 1080);
  assert.equal(manifest.height, 1920);
  assert.equal(manifest.totalFrames, 105);
  assert.deepEqual(manifest.scenes.map(s => [s.id, s.startFrame, s.frameCount]), [
    ["a", 0, 60], ["b", 60, 45],
  ]);
  assert.equal(manifest.scenes[0].overlayText, "שלום עולם");
});

test("rejects missing media, invalid timing and duplicate scene IDs", () => {
  assert.throws(() => buildVideoRenderManifest([], "1:1"), VideoRenderValidationError);
  assert.throws(() => buildVideoRenderManifest([scene("a", 1, NaN)], "1:1"), VideoRenderValidationError);
  assert.throws(() => buildVideoRenderManifest([scene("a", 1, 2), scene("a", 2, 2)], "1:1"), VideoRenderValidationError);
  assert.throws(() => buildVideoRenderManifest([{ ...scene("a", 1, 2), imageUrl: "" }], "1:1"), VideoRenderValidationError);
});
