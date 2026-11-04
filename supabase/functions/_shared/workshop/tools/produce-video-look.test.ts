import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "the film's text style, size and font are saved for the render",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "running", clips: 1 },
    });
    await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      {
        item_id: "item-1",
        confirmed: true,
        title_style: "typewriter",
        title_size: "large",
        font: "suez-one",
      },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    );
    const video = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map(
        (c) =>
          (c.value as { payload?: { video?: Record<string, unknown> } }).payload
            ?.video,
      )
      .filter(Boolean)
      .pop();
    assertStrictEquals(video?.title_style, "typewriter");
    assertStrictEquals(video?.title_size, "large");
    assertStrictEquals(video?.font, "suez-one");
  },
);

/** The film's payload.video as the last work-item update of `workshop_produce_video` wrote it. */
async function producedVideo(args: Record<string, unknown>) {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
    "rpc:produce_video": { status: "running", clips: 1 },
  });
  await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_produce_video",
    { item_id: "item-1", confirmed: true, ...args },
    async () => {},
    null,
    { defaultEngine: async () => "mock" as const },
  );
  return db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map(
      (c) =>
        (c.value as { payload?: { video?: Record<string, unknown> } }).payload
          ?.video,
    )
    .filter(Boolean)
    .pop();
}

Deno.test("the film's end-card design is saved for the render", async () => {
  const video = await producedVideo({ end_card_style: "split" });
  assertStrictEquals(video?.end_card_style, "split");
  // A design the film does not know is not saved.
  const unknown = await producedVideo({ end_card_style: "neon" });
  assertStrictEquals(unknown?.end_card_style, undefined);
});

Deno.test(
  "the film's scene overlay is saved for the render, an unknown one is not",
  async () => {
    const savedOverlay = async (sceneOverlay: string) => {
      const db = fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
        "rpc:produce_video": { status: "running", clips: 1 },
      });
      await executeApprovedWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", confirmed: true, scene_overlay: sceneOverlay },
        async () => {},
        null,
        { defaultEngine: async () => "mock" as const },
      );
      const video = db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map(
          (c) =>
            (c.value as { payload?: { video?: Record<string, unknown> } })
              .payload?.video,
        )
        .filter(Boolean)
        .pop();
      assertStrictEquals(typeof video, "object");
      return video?.scene_overlay;
    };
    assertStrictEquals(await savedOverlay("confetti"), "confetti");
    assertStrictEquals(await savedOverlay("sparkles"), undefined);
  },
);

Deno.test(
  "the film's key-word emphasis is saved for the render, an unknown one is not",
  async () => {
    const savedEmphasis = async (titleEmphasis: string) => {
      const db = fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
        "rpc:produce_video": { status: "running", clips: 1 },
      });
      await executeApprovedWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", confirmed: true, title_emphasis: titleEmphasis },
        async () => {},
        null,
        { defaultEngine: async () => "mock" as const },
      );
      const video = db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map(
          (c) =>
            (c.value as { payload?: { video?: Record<string, unknown> } })
              .payload?.video,
        )
        .filter(Boolean)
        .pop();
      return video ? video.title_emphasis : "no video saved";
    };
    assertStrictEquals(await savedEmphasis("count"), "count");
    assertStrictEquals(await savedEmphasis("sparkle"), undefined);
  },
);

Deno.test(
  "the film's end-card background and glass are saved for the render",
  async () => {
    const video = await producedVideo({
      end_card_background: "light-rays",
      end_card_glass: true,
    });
    assertStrictEquals(video?.end_card_background, "light-rays");
    assertStrictEquals(video?.end_card_glass, true);
    const off = await producedVideo({ end_card_glass: false });
    assertStrictEquals(off?.end_card_glass, false);
    // A background the film does not know, or glass that is not a yes or no, is not saved.
    const unknown = await producedVideo({
      end_card_background: "neon",
      end_card_glass: "yes",
    });
    assertStrictEquals(unknown?.end_card_background, undefined);
    assertStrictEquals(unknown?.end_card_glass, undefined);
  },
);
