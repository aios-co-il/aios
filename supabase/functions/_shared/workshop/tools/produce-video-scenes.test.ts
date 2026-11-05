import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ToolContext } from "../tool-context.ts";
import { sceneEngineFor, scenesToMake } from "./produce-video-scenes.ts";
import { fakeDb, scene } from "./test-fakes.ts";

/** A context on a fake client answering the asset reads with `assets`. */
const ctx = (assets: Array<Record<string, unknown>> = []): ToolContext => ({
  supabase: fakeDb({ "marketing_assets:select": assets }),
  tenantId: "tenant-1",
  name: "workshop_produce_video",
  args: {},
  assertClientAccess: async () => {},
  userId: null,
  deps: {},
});

describe("sceneEngineFor", () => {
  it("takes the engine asked for, and the free preview for a kept design", async () => {
    const deps = { defaultEngine: async () => "higgsfield" as const };
    assertStrictEquals(
      await sceneEngineFor({ engine: "kling" }, {}, deps, false),
      "kling",
    );
    assertStrictEquals(
      await sceneEngineFor({ engine: "kling" }, {}, deps, true),
      "mock",
    );
  });

  it("re-checks a remembered ElevenLabs choice, and falls back to the preview", async () => {
    const video = { scene_engine: "elevenlabs" };
    const deps = { defaultEngine: async () => "higgsfield" as const };
    assertStrictEquals(
      await sceneEngineFor({}, video, deps, false),
      "higgsfield",
    );
    assertStrictEquals(await sceneEngineFor({}, {}, {}, false), "mock");
  });
});

describe("scenesToMake", () => {
  it("animates the scenes without a clip, stale or failed, and keeps the rest", async () => {
    const scenes = [
      scene("s-1", { still_asset_id: "still-1" }),
      scene("s-2", { clip_asset_id: "clip-2", clip_stale: true }),
      scene("s-3", { clip_asset_id: "clip-3", status: "failed" }),
      scene("s-4", { clip_asset_id: "clip-4" }),
    ];
    const made = await scenesToMake(ctx(), "item-1", scenes, "mock", false);
    assertEquals(
      made.animated.map((one) => one.id),
      ["s-1", "s-2", "s-3"],
    );
    assertStrictEquals(made.relip.length, 0);
  });

  it("lip-syncs again a kept talking clip that does not say the current line", async () => {
    const talking = scene("s-1", {
      still_asset_id: "still-1",
      clip_asset_id: "clip-1",
      meta: { lipsync: true, dialogue: "שלום חדש" },
    });
    const old = [{ id: "clip-1", meta: { lipsync: true, dialogue: "שלום" } }];
    const made = await scenesToMake(
      ctx(old),
      "item-1",
      [talking],
      "mock",
      false,
    );
    assertEquals(
      made.relip.map((one) => one.id),
      ["s-1"],
    );
  });
});
