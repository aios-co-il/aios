import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "a finished design is produced as a camera move over the original picture",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "running", clips: 1 },
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true, keep_design: true },
      async () => {},
      null,
      { defaultEngine: async () => "openrouter" as const },
    )) as { kept_design_note?: string };
    const rpc = db.calls.find((c) => c.table === "rpc:produce_video")
      ?.value as { p_options: { provider: string } };
    // Not a video model, which redraws the picture and garbles its text.
    assertStrictEquals(rpc.p_options.provider, "mock");
    // Asked for in this call: nothing to point out.
    assertStrictEquals(result.kept_design_note, undefined);
    const saved = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map(
        (c) =>
          (c.value as { payload?: { video?: Record<string, unknown> } })
            .payload,
      )
      .filter((payload) => payload?.video)
      .pop();
    // The render reads it to fit the whole picture in the frame.
    assertStrictEquals(saved?.video?.keep_design, true);
  },
);

Deno.test(
  "a later production of a finished design keeps it without being asked again",
  async () => {
    const project = videoProject();
    const item = project["marketing_work_items:select"];
    const db = fakeDb({
      "marketing_work_items:select": {
        ...item,
        payload: {
          ...item.payload,
          video: { ...item.payload.video, keep_design: true },
        },
      },
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "running", clips: 1 },
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { defaultEngine: async () => "openrouter" as const },
    )) as { kept_design_note?: string };
    const rpc = db.calls.find((c) => c.table === "rpc:produce_video")
      ?.value as { p_options: { provider: string } };
    assertStrictEquals(rpc.p_options.provider, "mock");
    // Staging, 2 Nov: Carmen did not know the film still kept its design when the user asked for
    // real animation, so she is told how to undo it.
    assertMatch(String(result.kept_design_note), /keep_design=false/);
  },
);

/** Produces a film that keeps its design, whose one scene already has the clip `clip`. */
async function produceKeptDesign(clip: Record<string, unknown>) {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a", clip_asset_id: "c-1" }),
    ],
    "marketing_assets:select": [{ id: "c-1", meta: clip }],
    "rpc:produce_video": { status: "running", clips: 1 },
  });
  await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1", confirmed: true, keep_design: true },
    async () => {},
    null,
    { defaultEngine: async () => "openrouter" as const },
  );
  const marked = db.calls.findIndex(
    (c) =>
      c.table === "marketing_video_scenes" &&
      c.op === "update" &&
      (c.value as { clip_stale?: boolean }).clip_stale === true,
  );
  const produced = db.calls.findIndex((c) => c.table === "rpc:produce_video");
  return { marked, produced };
}

Deno.test(
  "a finished design that a video model already redrew is made again from the picture",
  async () => {
    // Staging, 2 Nov: the poster's OpenRouter clip stayed in the film with garbled text.
    const { marked, produced } = await produceKeptDesign({
      provider: "openrouter",
      source_still_asset_id: "a",
    });
    assert(marked >= 0);
    // produce_video queues a clip only for an outdated scene, so the mark comes first.
    assert(marked < produced);
  },
);

Deno.test(
  "a video the user uploaded stays in a film that keeps its design",
  async () => {
    const { marked, produced } = await produceKeptDesign({ path: "u.mp4" });
    assertStrictEquals(marked, -1);
    assert(produced >= 0);
  },
);
