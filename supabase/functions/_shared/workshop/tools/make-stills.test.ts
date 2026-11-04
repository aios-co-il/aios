import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
  type SavedBrief,
} from "./test-fakes.ts";

Deno.test(
  "stills ask first, then each scene gets its picture attached",
  async () => {
    const script = {
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1"),
        scene("s-2", { still_asset_id: "has" }),
        scene("s-3"),
      ],
    };
    let generated = 0;
    const deps = {
      generateImage: async () => {
        generated += 1;
        return { image_url: `https://x/${generated}.png` };
      },
    };
    const asked = (await executeApprovedWorkshopTool(
      fakeDb(script),
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1" },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assertStrictEquals(asked.needs_budget, true);
    assertStrictEquals(asked.scenes, 2);
    assertStrictEquals(generated, 0);

    const db = fakeDb({
      ...script,
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const done = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      deps,
    )) as Record<string, any>;
    assertStrictEquals(done.created, 2);
    assertStrictEquals(done.remaining, 0);
    const attached = db.calls.filter(
      (c) => c.table === "rpc:attach_video_scene_asset",
    );
    assertEquals(
      attached.map((c) => (c.value as any).p_scene_id),
      ["s-1", "s-3"],
    );
    assertStrictEquals((attached[0].value as any).p_kind, "still");
    assertMatch(done.message, /מופיעות בלוח/);
    assertMatch(done.message, /הפקת הסרט/);
    const pages = db.calls.filter(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    );
    assertStrictEquals(pages.length, 2);
    assertStrictEquals((pages[0].value as any).kind, "scene_still");
    assertStrictEquals((pages[0].value as any).ref_id, "asset-1");
  },
);

Deno.test(
  "a scene picture already mirrored by the database trigger is not added twice",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1")],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
      "workshop_artifacts:select": { id: "page-1" },
    });
    await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { generateImage: async () => ({ image_url: "https://x/1.png" }) },
    );
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          !Array.isArray(c.value),
      ),
      false,
    );
  },
);

Deno.test(
  "a second stills request while pictures are being made does not pay twice",
  async () => {
    let made = 0;
    const result = (await executeApprovedWorkshopTool(
      fakeDb({
        ...videoProject(),
        "marketing_video_scenes:select": [scene("s-1")],
        "workshop_artifacts:select": [{ id: "pending-1" }],
      }),
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async () => {
          made += 1;
          return { image_url: "https://x/1.png" };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(made, 0);
  },
);

Deno.test(
  "a scene picture that fails turns its pending page into an error card",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1")],
    });
    await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      { generateImage: async () => ({ error: "quota" }) },
    );
    const pending = db.calls.find(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        Array.isArray(c.value),
    );
    const row = (pending?.value as Record<string, any>[])[0];
    assertStrictEquals(row.kind, "scene_still");
    assertStrictEquals(row.meta.scene_id, "s-1");
    const failedUpdate = db.calls.find(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "update" &&
        (c.value as any).status === "failed" &&
        (c.value as any).meta.text === "quota",
    );
    assert(failedUpdate);
  },
);

Deno.test(
  "a redo of the pictures keeps the user's own video scenes",
  async () => {
    const generatedFor: string[] = [];
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("own", { clip_asset_id: "user-clip", status: "clip_ready" }),
        scene("made", { still_asset_id: "old-still" }),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-new" },
    });
    await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true, redo: true },
      async () => {},
      null,
      {
        generateImage: async (prompt: string) => {
          generatedFor.push(prompt);
          return { image_url: "https://x/new.png" };
        },
      },
    );
    assertStrictEquals(generatedFor.length, 1);
    const attached = db.calls.filter(
      (c) => c.table === "rpc:attach_video_scene_asset",
    );
    assertEquals(
      attached.map((c) => (c.value as Record<string, unknown>).p_scene_id),
      ["made"],
    );
  },
);

Deno.test(
  "an image attached in the message is a reference picture the stills are made from",
  async () => {
    const db = fakeDb({
      ...videoProject({
        payload: {
          format: "9:16",
          project_type: "video",
          workshop_look: { film: "קצב: רגוע" },
          workshop_brief: { asked: true },
        },
      }),
      "marketing_video_scenes:select": [scene("s-1")],
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1" },
      async () => {},
      null,
      {
        turnId: "turn-1",
        userText:
          "תמשיכי לפי זה\n\n📎 קבצים מצורפים (1):\n- תמונה: ad.png → https://files.example.com/ad.png",
        generateImage: async () => ({ image_url: "https://x/1.png" }),
      },
    )) as Record<string, unknown>;
    assertStrictEquals(result.needs_input, undefined);
    const saved = db.calls.find(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    )?.value as SavedBrief;
    assertEquals(saved.payload.workshop_look?.references, [
      "https://files.example.com/ad.png",
    ]);
  },
);
