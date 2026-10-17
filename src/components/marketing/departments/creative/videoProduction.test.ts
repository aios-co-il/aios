import assert from "node:assert/strict";
import test from "node:test";
import type { StoryboardFrame } from "./types.ts";
import {
  getProduction,
  productionPlan,
  productionProgress,
} from "./videoProduction.ts";

const frame = (overrides: Partial<StoryboardFrame>): StoryboardFrame => ({
  id: "a",
  order: 1,
  title: "",
  shot: "Medium shot",
  visualPrompt: "a café",
  overlayText: "",
  voiceover: "",
  duration: 4,
  x: 0,
  y: 100,
  ...overrides,
});

const settings = {
  sceneEngine: "mock" as const,
  soundEngine: "elevenlabs" as const,
  stillModel: "nano-banana-pro" as const,
  hasMusic: false,
};

test("the plan makes missing stills, animates them and every scene without a current clip", () => {
  const plan = productionPlan(
    [
      frame({ id: "new", order: 1 }),
      frame({ id: "still", order: 2, imageUrl: "u", stillAssetId: "s" }),
      frame({
        id: "done",
        order: 3,
        imageUrl: "u",
        stillAssetId: "s",
        clipAssetId: "c",
        status: "clip_ready",
      }),
      frame({
        id: "stale",
        order: 4,
        imageUrl: "u",
        stillAssetId: "s",
        clipAssetId: "c",
        clipStale: true,
      }),
    ],
    settings,
  );
  assert.deepEqual(
    plan.stills.map((f) => f.id),
    ["new"],
  );
  assert.deepEqual(plan.clips.map((f) => f.id).sort(), [
    "new",
    "stale",
    "still",
  ]);
  assert.equal(plan.music, true);
  assert.equal(plan.usd.stills, 0.13);
  assert.equal(plan.usd.clips, 0);
  assert.equal(plan.assembleOnly, false);
});

test("a finished storyboard with only text edits is assembled again for free", () => {
  const plan = productionPlan(
    [
      frame({
        imageUrl: "u",
        stillAssetId: "s",
        clipAssetId: "c",
        status: "clip_ready",
        voiceover: "שלום",
        voiceAssetId: "v",
        voiceText: "שלום",
      }),
    ],
    { ...settings, hasMusic: true },
  );
  assert.equal(plan.assembleOnly, true);
  assert.equal(plan.usd.total, 0);
});

test("production state and progress read from payload.video.production", () => {
  assert.equal(
    getProduction({ video: { production: { status: "nope" } } }),
    null,
  );
  const running = getProduction({
    video: { production: { status: "running" } },
  });
  assert.equal(running?.status, "running");
  const progress = productionProgress(
    [
      frame({ status: "clip_generating" }),
      frame({ id: "b", status: "clip_ready" }),
    ],
    running,
    undefined,
  );
  assert.match(progress!.label, /1 מתוך 2/);
  assert.equal(productionProgress([], { status: "done" }, undefined), null);
  assert.equal(
    productionProgress([frame({ status: "clip_ready" })], running, "running")
      ?.label,
    "מרכיב את הסרט…",
  );
});
