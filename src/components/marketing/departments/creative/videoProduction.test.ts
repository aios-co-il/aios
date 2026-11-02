import { expect, test } from "vitest";
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
  expect(plan.stills.map((f) => f.id)).toStrictEqual(["new"]);
  expect(plan.clips.map((f) => f.id).sort()).toStrictEqual([
    "new",
    "stale",
    "still",
  ]);
  expect(plan.music).toBe(true);
  expect(plan.usd.stills).toBe(0.13);
  expect(plan.usd.clips).toBe(0);
  expect(plan.assembleOnly).toBe(false);
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
  expect(plan.assembleOnly).toBe(true);
  expect(plan.usd.total).toBe(0);
});

test("production state and progress read from payload.video.production", () => {
  expect(getProduction({ video: { production: { status: "nope" } } })).toBe(
    null,
  );
  const running = getProduction({
    video: { production: { status: "running" } },
  });
  expect(running?.status).toBe("running");
  const progress = productionProgress(
    [
      frame({ status: "clip_generating" }),
      frame({ id: "b", status: "clip_ready" }),
    ],
    running,
    undefined,
  );
  expect(progress!.label).toMatch(/1 מתוך 2/);
  expect(productionProgress([], { status: "done" }, undefined)).toBe(null);
  expect(
    productionProgress([frame({ status: "clip_ready" })], running, "running")
      ?.label,
  ).toBe("מרכיב את הסרט…");
});
