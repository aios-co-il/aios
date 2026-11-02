import { expect, test } from "vitest";
import type { StoryboardFrame } from "./types";
import {
  buildVideoRenderManifest,
  VideoRenderValidationError,
} from "./videoRenderManifest";

const scene = (
  id: string,
  order: number,
  duration: number,
): StoryboardFrame => ({
  id,
  order,
  duration,
  title: "Scene",
  shot: "Wide",
  visualPrompt: "Ocean",
  overlayText: "שלום עולם",
  voiceover: "קריינות בעברית",
  imageUrl: "https://example.com/scene.png",
  x: 0,
  y: 0,
});

test("builds contiguous frames in storyboard order and preserves Hebrew", () => {
  const manifest = buildVideoRenderManifest(
    [scene("b", 2, 1.5), scene("a", 1, 2)],
    "9:16",
  );
  expect(manifest.width).toBe(1080);
  expect(manifest.height).toBe(1920);
  expect(manifest.totalFrames).toBe(105);
  expect(
    manifest.scenes.map((s) => [s.id, s.startFrame, s.frameCount]),
  ).toStrictEqual([
    ["a", 0, 60],
    ["b", 60, 45],
  ]);
  expect(manifest.scenes[0].overlayText).toBe("שלום עולם");
});

test("rejects missing media, invalid timing and duplicate scene IDs", () => {
  expect(() => buildVideoRenderManifest([], "1:1")).toThrow(
    VideoRenderValidationError,
  );
  expect(() => buildVideoRenderManifest([scene("a", 1, NaN)], "1:1")).toThrow(
    VideoRenderValidationError,
  );
  expect(() =>
    buildVideoRenderManifest([scene("a", 1, 2), scene("a", 2, 2)], "1:1"),
  ).toThrow(VideoRenderValidationError);
  expect(() =>
    buildVideoRenderManifest([{ ...scene("a", 1, 2), imageUrl: "" }], "1:1"),
  ).toThrow(VideoRenderValidationError);
});
