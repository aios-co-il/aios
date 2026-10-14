import assert from "node:assert/strict";
import test from "node:test";
import {
  clipEstimate,
  framesToAnimate,
  mergeServerScenes,
} from "./videoClip.ts";
import { scenesToFrames } from "./videoScenes.ts";
import type { StoryboardFrame } from "./types.ts";

const frame = (overrides: Partial<StoryboardFrame>): StoryboardFrame => ({
  id: "a",
  order: 1,
  title: "סצנה",
  shot: "Medium shot",
  visualPrompt: "",
  overlayText: "",
  voiceover: "",
  duration: 3,
  x: 0,
  y: 100,
  ...overrides,
});

test("the estimate bills 5 s blocks: up to 5 s is one clip, longer scenes two", () => {
  assert.deepEqual(
    clipEstimate([
      frame({ duration: 3 }),
      frame({ duration: 5 }),
      frame({ duration: 8 }),
    ]),
    { count: 3, seconds: 20, usd: 3.4, credits: 20400 },
  );
});

test("animate all takes approved, failed and stale scenes that have a still", () => {
  const still = { stillAssetId: "s", imageUrl: "https://x/still.png" };
  const picked = framesToAnimate([
    frame({ id: "approved", order: 2, status: "still_approved", ...still }),
    frame({ id: "ready", order: 1, status: "still_ready", ...still }),
    frame({ id: "failed", order: 3, status: "failed", ...still }),
    frame({
      id: "busy",
      order: 4,
      status: "clip_generating",
      clipStale: true,
      clipAssetId: "c",
      ...still,
    }),
    frame({
      id: "stale",
      order: 5,
      status: "clip_ready",
      clipStale: true,
      clipAssetId: "c",
      ...still,
    }),
    frame({
      id: "fresh",
      order: 6,
      status: "clip_ready",
      clipAssetId: "c",
      ...still,
    }),
    frame({ id: "nostill", order: 7, status: "still_approved" }),
  ]);
  assert.deepEqual(
    picked.map((f) => f.id),
    ["approved", "failed", "stale"],
  );
});

test("an untouched draft takes the server storyboard as is", () => {
  const previous = [frame({ status: "still_approved" })];
  const server = [frame({ status: "clip_generating", title: "חדש" })];
  assert.equal(mergeServerScenes(previous, server, previous), server);
});

test("an edited draft keeps its text and takes only job progress", () => {
  const previous = [frame({ status: "clip_generating" })];
  const draft = [
    frame({ status: "clip_generating", motionPrompt: "המצלמה מתקרבת" }),
  ];
  const server = [
    frame({
      status: "clip_ready",
      clipAssetId: "c1",
      clipPath: "t/c/i/a/clip-v1.mp4",
      title: "שונה",
    }),
  ];
  assert.deepEqual(mergeServerScenes(draft, server, previous), [
    frame({
      status: "clip_ready",
      clipAssetId: "c1",
      clipPath: "t/c/i/a/clip-v1.mp4",
      motionPrompt: "המצלמה מתקרבת",
    }),
  ]);
});

test("scene rows carry the current clip path and stale flag", () => {
  const [mapped] = scenesToFrames(
    [
      {
        id: "a",
        item_id: "i",
        position: 1,
        title: "",
        shot: "",
        visual_prompt: "",
        overlay_text: "",
        voiceover_text: "",
        duration_s: 5,
        still_asset_id: "s",
        clip_asset_id: "c",
        clip_stale: true,
        status: "clip_ready",
        meta: {},
      },
    ],
    new Map([
      ["s", { id: "s", url: "https://x/still.png", meta: {} }],
      ["c", { id: "c", url: "t/c/i/a/clip-v2.mp4", meta: {} }],
    ]),
    () => 0,
  );
  assert.equal(mapped.clipAssetId, "c");
  assert.equal(mapped.clipPath, "t/c/i/a/clip-v2.mp4");
  assert.equal(mapped.clipStale, true);
  assert.equal(mapped.imageUrl, "https://x/still.png");
});
