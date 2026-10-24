import assert from "node:assert/strict";
import { test } from "node:test";
import { artifactRow, folderTree, skinForTool } from "./artifacts.ts";

test("an artifact row lands in its kind's folder and trims the title", () => {
  const row = artifactRow({
    tenantId: "t",
    itemId: "i",
    kind: "narration",
    title: "  קריינות  ",
    url: "https://x/a.mp3",
  });
  assert.equal(row.folder, "video/narration");
  assert.equal(row.title, "קריינות");
  assert.equal(row.thumb_url, "https://x/a.mp3");
  assert.equal(row.status, "ready");
});

test("the folder tree lists only folders that hold something", () => {
  const tree = folderTree([
    { folder: "images" },
    { folder: "images" },
    { folder: "video/film" },
  ]);
  assert.deepEqual(tree, [
    { folder: "images", label: "תמונות", count: 2 },
    { folder: "video/film", label: "סרט סופי", count: 1 },
  ]);
});

test("the skin that wears the hat follows the tool", () => {
  assert.equal(skinForTool("workshop_write_copy"), "copywriter");
  assert.equal(skinForTool("workshop_save_concepts"), "copywriter");
  assert.equal(skinForTool("workshop_save_copy"), "copywriter");
  assert.equal(skinForTool("workshop_produce_video"), "video_director");
  assert.equal(skinForTool("workshop_make_creative"), "creative_studio");
  assert.equal(skinForTool("create_lead"), null);
});
