import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { lookOf } from "../look.ts";
import type { ToolContext } from "../tool-context.ts";
import { renderBatch } from "./make-stills-batch.ts";
import type { StillJob } from "./make-stills-render.ts";
import { fakeDb, scene } from "./test-fakes.ts";

/** A job whose engine fails the prompts in `failing` and records the references of each call. */
function job(failing: Array<string> = []) {
  const ctx: ToolContext = {
    supabase: fakeDb({ "rpc:attach_video_scene_asset": { id: "asset-1" } }),
    tenantId: "tenant-1",
    name: "workshop_make_stills",
    args: {},
    assertClientAccess: async () => {},
    userId: null,
    deps: {},
  };
  const references: Array<Array<string>> = [];
  const stillJob: StillJob = {
    ctx,
    itemId: "item-1",
    generateImage: async (prompt, _format, refs = []) => {
      references.push(refs);
      return failing.some((visual) => prompt.includes(visual))
        ? { error: "failed" }
        : { image_url: `https://x/still-${references.length}.png` };
    },
    look: lookOf({}),
    format: "9:16",
    engine: null,
    anchorUrl: null,
  };
  return { stillJob, references };
}

describe("renderBatch", () => {
  it("makes the anchor frame first and the rest from it", async () => {
    const { stillJob, references } = job();
    const anchors: Array<string | null> = [];
    const results = await renderBatch(
      stillJob,
      [scene("s-1"), scene("s-2")],
      async (anchorUrl) => {
        anchors.push(anchorUrl);
      },
    );
    assertEquals(
      results.map((result) => result.ok),
      [true, true],
    );
    assertEquals(anchors, ["https://x/still-1.png"]);
    assertEquals(references[1], ["https://x/still-1.png"]);
    assertStrictEquals(stillJob.anchorUrl, "https://x/still-1.png");
  });

  it("leaves the plain scenes for the next call when the anchor fails", async () => {
    const { stillJob } = job(["a plain scene"]);
    const own = scene("s-2", {
      visual_prompt: "her own picture",
      meta: { reference_url: "https://x/own.png" },
    });
    const results = await renderBatch(
      stillJob,
      [
        scene("s-1", { visual_prompt: "a plain scene" }),
        own,
        scene("s-3", { visual_prompt: "another scene" }),
      ],
      async () => {},
    );
    assertEquals(
      results.map((result) => [result.scene, result.ok]),
      [
        ["s-1", false],
        ["s-2", true],
      ],
    );
  });
});
