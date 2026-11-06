import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { lookOf } from "../look.ts";
import type { ToolContext } from "../tool-context.ts";
import {
  ownReference,
  renderGroup,
  type StillJob,
} from "./make-stills-render.ts";
import { fakeDb, scene } from "./test-fakes.ts";

/** A job on a fake client whose image engine answers with `answer` and records each call. */
function job(
  answer: { image_url?: string; error?: string },
  over: Partial<StillJob> = {},
) {
  const db = fakeDb({ "rpc:attach_video_scene_asset": { id: "asset-1" } });
  const asked: Array<{ prompt: string; references?: Array<string> }> = [];
  const ctx: ToolContext = {
    supabase: db,
    tenantId: "tenant-1",
    name: "workshop_make_stills",
    args: {},
    assertClientAccess: async () => {},
    userId: null,
    deps: {},
  };
  const stillJob: StillJob = {
    ctx,
    itemId: "item-1",
    generateImage: async (prompt, _format, references) => {
      asked.push({ prompt, references });
      return answer;
    },
    look: lookOf({ workshop_look: { references: ["https://x/ref.png"] } }),
    format: "9:16",
    engine: null,
    anchorUrl: null,
    ...over,
  };
  return { db, asked, stillJob };
}

describe("renderGroup", () => {
  it("makes each scene's picture from the look and anchor, and attaches it", async () => {
    const { db, asked, stillJob } = job(
      { image_url: "https://x/still.png" },
      { anchorUrl: "https://x/anchor.png" },
    );
    const [made] = await renderGroup(stillJob, [scene("s-1")]);
    assertEquals(made, { scene: "s-1", ok: true, url: "https://x/still.png" });
    assertEquals(asked[0].references, [
      "https://x/ref.png",
      "https://x/anchor.png",
    ]);
    assertMatch(asked[0].prompt, /No text on the image at all/);
    assertStrictEquals(
      db.calls.some((call) => call.table === "rpc:attach_video_scene_asset"),
      true,
    );
  });

  it("makes a scene with its own picture from that picture alone", async () => {
    const { asked, stillJob } = job({ image_url: "https://x/still.png" });
    const own = scene("s-1", { meta: { reference_url: "https://x/own.png" } });
    assertStrictEquals(ownReference(own), "https://x/own.png");
    await renderGroup(stillJob, [own]);
    assertEquals(asked[0].references, ["https://x/own.png"]);
  });

  it("reports the engine's error when no picture comes back", async () => {
    const { db, stillJob } = job({ error: "quota" });
    const [failed] = await renderGroup(stillJob, [scene("s-1")]);
    assertEquals(failed, { scene: "s-1", ok: false, error: "quota" });
    assertStrictEquals(
      db.calls.some((call) => call.table === "rpc:attach_video_scene_asset"),
      false,
    );
  });
});
