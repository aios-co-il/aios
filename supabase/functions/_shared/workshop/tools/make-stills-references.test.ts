import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "stills follow the user's references and every later scene follows the first one",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1"),
        scene("s-2"),
        scene("s-3"),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const seen: { prompt: string; references?: string[] }[] = [];
    const done = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      {
        item_id: "item-1",
        confirmed: true,
        reference_urls: ["https://x/ref-1.png", "not a url"],
        style_bible:
          "Carmen: mid-30s, dark bob, teal blazer. Flat vector style.",
      },
      async () => {},
      null,
      {
        generateImage: async (
          prompt: string,
          _format: string,
          refs?: string[],
        ) => {
          seen.push({ prompt, references: refs });
          return { image_url: `https://x/still-${seen.length}.png` };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(done.created, 3);
    assertStrictEquals(done.used_references, 1);
    assertEquals(seen[0].references, ["https://x/ref-1.png"]);
    assertEquals(seen[1].references, [
      "https://x/ref-1.png",
      "https://x/still-1.png",
    ]);
    assertEquals(seen[2].references, seen[1].references);
    assertMatch(seen[0].prompt, /dark bob, teal blazer/);
    // Staging, 2 Nov: a picture asked for a plaque to write on came back with a blank one.
    assertMatch(seen[0].prompt, /no signs, plaques, banners/);
    assertMatch(seen[1].prompt, /approved first frame/);
    assertNotMatch(seen[0].prompt, /approved first frame/);
    const saved = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as Record<string, any>).payload.workshop_look);
    assertStrictEquals(
      saved[saved.length - 1].anchor_url,
      "https://x/still-1.png",
    );
    assertEquals(saved[0].references, ["https://x/ref-1.png"]);
  },
);

Deno.test(
  "a scene with its own picture is made from that picture, never from the anchor",
  async () => {
    const skin = (n: number) => `https://cdn.example.com/skin-${n}.png`;
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1", { meta: { reference_url: skin(1) } }),
        scene("s-2"),
        scene("s-3", { meta: { reference_url: skin(3) } }),
        scene("s-4"),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const seen: { prompt: string; references?: string[] }[] = [];
    const done = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      {
        item_id: "item-1",
        confirmed: true,
        reference_urls: ["https://x/brand.png"],
      },
      async () => {},
      null,
      {
        generateImage: async (
          prompt: string,
          _format: string,
          refs?: string[],
        ) => {
          seen.push({ prompt, references: refs });
          return { image_url: `https://x/still-${seen.length}.png` };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(done.created, 4);
    assertStrictEquals(done.own_reference_scenes, 2);
    // The anchor is the first scene that follows the project's look (s-2), made first.
    assertEquals(seen[0].references, ["https://x/brand.png"]);
    const own = seen.filter((call) =>
      call.references?.some((url) => url.includes("skin-")),
    );
    assertEquals(
      own.map((call) => call.references),
      [[skin(1)], [skin(3)]],
    );
    for (const call of own) {
      assertMatch(call.prompt, /this scene's character reference/);
      assertMatch(call.prompt, /warm editorial look/);
      assertNotMatch(call.prompt, /approved first frame/);
    }
    const plain = seen.slice(1).filter((call) => !own.includes(call));
    assertEquals(
      plain.map((call) => call.references),
      [["https://x/brand.png", "https://x/still-1.png"]],
    );
    const attached = db.calls
      .filter((c) => c.table === "rpc:attach_video_scene_asset")
      .map((c) => c.value as Record<string, any>);
    assertEquals(
      attached
        .filter((call) => call.p_meta.reference_url)
        .map((call) => call.p_scene_id)
        .sort(),
      ["s-1", "s-3"],
    );
    assertMatch(done.message, /2 מהן נוצרו לפי התמונה של הסצנה/);
  },
);

Deno.test(
  "when the anchor frame fails, scenes with their own picture are still made",
  async () => {
    const skin = (n: number) => `https://cdn.example.com/skin-${n}.png`;
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1"),
        scene("s-2", { meta: { reference_url: skin(2) } }),
        scene("s-3"),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const seen: (string[] | undefined)[] = [];
    const done = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (_p: string, _f: string, refs?: string[]) => {
          seen.push(refs);
          if (seen.length === 1) throw new Error("engine busy");
          return { image_url: `https://x/still-${seen.length}.png` };
        },
      },
    )) as Record<string, any>;
    // The anchor (s-1) failed; s-2 has its own picture and is made; s-3 waits for the anchor.
    assertStrictEquals(done.created, 1);
    assertStrictEquals(done.own_reference_scenes, 1);
    assertEquals(seen.slice(1), [[skin(2)]]);
    assertStrictEquals(done.anchored, false);
  },
);

Deno.test(
  "when every scene has its own picture no anchor frame is made or saved",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [
        scene("s-1", {
          meta: { reference_url: "https://cdn.example.com/a.png" },
        }),
        scene("s-2", {
          meta: { reference_url: "https://cdn.example.com/b.png" },
        }),
      ],
      "rpc:attach_video_scene_asset": { id: "asset-1" },
    });
    const seen: (string[] | undefined)[] = [];
    const done = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_stills",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (_p: string, _f: string, refs?: string[]) => {
          seen.push(refs);
          return { image_url: `https://x/still-${seen.length}.png` };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(done.created, 2);
    assertStrictEquals(done.anchored, false);
    assertEquals(seen.map((refs) => refs?.[0]).sort(), [
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.png",
    ]);
    const looks = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as Record<string, any>).payload.workshop_look);
    assertStrictEquals(
      looks.some((look) => look?.anchor_url),
      false,
    );
  },
);
