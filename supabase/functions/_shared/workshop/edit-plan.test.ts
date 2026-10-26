import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { AssetView } from "./assets.ts";
import { pickMaterials, planEditScenes } from "./edit-plan.ts";

const asset = (
  id: string,
  asset_type: AssetView["asset_type"],
  extra: Partial<AssetView> = {},
): AssetView => ({
  id,
  asset_type,
  source: "user",
  title: id,
  url: null,
  storage_path: `tenant-1/workshop/item-1/${id}`,
  text: null,
  use_as_reference: false,
  meta: {},
  created_at: "2026-10-25",
  ...extra,
});

Deno.test(
  "only videos and pictures with a file become scenes, in upload order",
  () => {
    const picked = pickMaterials(
      [
        asset("v1", "video"),
        asset("doc", "file"),
        asset("i1", "image"),
        asset("link", "link", { storage_path: null, url: "https://a.co" }),
        asset("i2", "image", { storage_path: null, url: null }),
      ],
      undefined,
    );
    assertEquals(
      picked.map((a) => a.id),
      ["v1", "i1"],
    );
  },
);

Deno.test("asked ids set the order and unknown ids are skipped", () => {
  const picked = pickMaterials(
    [asset("v1", "video"), asset("i1", "image")],
    ["i1", "nope", "v1"],
  );
  assertEquals(
    picked.map((a) => a.id),
    ["i1", "v1"],
  );
});

Deno.test(
  "a video is the scene's clip, a picture its still, with captions and voice by order",
  () => {
    let n = 0;
    const plan = planEditScenes(
      [asset("v1", "video", { meta: { duration_s: 7 } }), asset("i1", "image")],
      { captions: ["פתיחה", "סגירה"], voiceover: ["שלום"], image_seconds: 2 },
      () => `scene-${++n}`,
    );
    assertStrictEquals(plan[0].kind, "clip");
    assertStrictEquals(plan[0].row.duration_s, 7);
    assertStrictEquals(plan[0].row.overlay_text, "פתיחה");
    assertStrictEquals(plan[0].row.voiceover_text, "שלום");
    assertStrictEquals(plan[1].kind, "still");
    assertStrictEquals(plan[1].row.duration_s, 2);
    assertStrictEquals(plan[1].row.voiceover_text, "");
    assertEquals(
      plan.map((s) => s.row.position),
      [1, 2],
    );
  },
);
