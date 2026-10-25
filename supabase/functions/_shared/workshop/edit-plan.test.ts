import assert from "node:assert/strict";
import { test } from "node:test";
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

test("only videos and pictures with a file become scenes, in upload order", () => {
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
  assert.deepEqual(
    picked.map((a) => a.id),
    ["v1", "i1"],
  );
});

test("asked ids set the order and unknown ids are skipped", () => {
  const picked = pickMaterials(
    [asset("v1", "video"), asset("i1", "image")],
    ["i1", "nope", "v1"],
  );
  assert.deepEqual(
    picked.map((a) => a.id),
    ["i1", "v1"],
  );
});

test("a video is the scene's clip, a picture its still, with captions and voice by order", () => {
  let n = 0;
  const plan = planEditScenes(
    [asset("v1", "video", { meta: { duration_s: 7 } }), asset("i1", "image")],
    { captions: ["פתיחה", "סגירה"], voiceover: ["שלום"], image_seconds: 2 },
    () => `scene-${++n}`,
  );
  assert.equal(plan[0].kind, "clip");
  assert.equal(plan[0].row.duration_s, 7);
  assert.equal(plan[0].row.overlay_text, "פתיחה");
  assert.equal(plan[0].row.voiceover_text, "שלום");
  assert.equal(plan[1].kind, "still");
  assert.equal(plan[1].row.duration_s, 2);
  assert.equal(plan[1].row.voiceover_text, "");
  assert.deepEqual(
    plan.map((s) => s.row.position),
    [1, 2],
  );
});
