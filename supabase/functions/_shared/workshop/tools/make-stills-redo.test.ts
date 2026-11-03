import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "when the first picture fails nothing else is generated without its anchor",
  async () => {
    let calls = 0;
    const done = (await executeApprovedWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [scene("s-1"), scene("s-2")],
      }),
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async () => {
          calls += 1;
          return { error: "quota" };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(calls, 1);
    assertStrictEquals(done.created, 0);
    assertMatch(done.message, /quota/);
  },
);

Deno.test(
  "redo drops the anchor and renders every scene again without blanking the old pictures",
  async () => {
    const db = fakeDb({
      ...videoProject({
        payload: {
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "warm editorial look",
            anchor_url: "https://x/old.png",
          },
        },
      }),
      "marketing_video_scenes:select": [
        scene("s-1", { still_asset_id: "a" }),
        scene("s-2", { still_asset_id: "b" }),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const seen: (string[] | undefined)[] = [];
    const done = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true, redo: true },
      async () => {},
      null,
      {
        generateImage: async (_p: string, _f: string, refs?: string[]) => {
          seen.push(refs);
          return { image_url: `https://x/new-${seen.length}.png` };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(done.created, 2);
    assertEquals(seen[0], []);
    assertEquals(seen[1], ["https://x/new-1.png"]);
    assertStrictEquals(
      db.calls.some(
        (c) => c.table === "marketing_video_scenes" && c.op === "update",
      ),
      false,
    );
    const last = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop();
    assertStrictEquals(last.workshop_redo_scenes, undefined);
  },
);

Deno.test(
  "a redo that stops early leaves the rest queued, and the next call picks them up",
  async () => {
    const scenes = Array.from({ length: 12 }, (_, i) =>
      scene(`s-${i + 1}`, { still_asset_id: `old-${i + 1}` }),
    );
    const db = fakeDb({
      ...videoProject({
        payload: {
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "warm",
          },
        },
      }),
      "marketing_video_scenes:select": scenes,
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    let made = 0;
    const done = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true, redo: true },
      async () => {},
      null,
      {
        generateImage: async () => {
          made += 1;
          return { image_url: `https://x/new-${made}.png` };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(done.created, 10);
    assertStrictEquals(done.remaining, 2);
    const last = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as any).payload)
      .pop();
    assertEquals(last.workshop_redo_scenes, ["s-11", "s-12"]);

    const next = fakeDb({
      ...videoProject({
        payload: {
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "warm",
            anchor_url: "https://x/new-1.png",
          },
          workshop_redo_scenes: ["s-11", "s-12"],
        },
      }),
      "marketing_video_scenes:select": scenes,
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const rest = (await executeApprovedWorkshopTool(
      next,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { generateImage: async () => ({ image_url: "https://x/late.png" }) },
    )) as Record<string, any>;
    assertStrictEquals(rest.created, 2);
    assertStrictEquals(rest.remaining, 0);
  },
);
