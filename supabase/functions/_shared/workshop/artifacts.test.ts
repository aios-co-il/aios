import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { artifactRow, folderTree, skinForTool } from "./artifacts.ts";

Deno.test(
  "an artifact row lands in its kind's folder and trims the title",
  () => {
    const row = artifactRow({
      tenantId: "t",
      itemId: "i",
      kind: "narration",
      title: "  קריינות  ",
      url: "https://x/a.mp3",
    });
    assertStrictEquals(row.folder, "video/narration");
    assertStrictEquals(row.title, "קריינות");
    assertStrictEquals(row.thumb_url, "https://x/a.mp3");
    assertStrictEquals(row.status, "ready");
  },
);

Deno.test("the folder tree lists only folders that hold something", () => {
  const tree = folderTree([
    { folder: "images" },
    { folder: "images" },
    { folder: "video/film" },
  ]);
  assertEquals(tree, [
    { folder: "images", label: "תמונות", count: 2 },
    { folder: "video/film", label: "סרט סופי", count: 1 },
  ]);
});

Deno.test("the skin that wears the hat follows the tool", () => {
  assertStrictEquals(skinForTool("workshop_write_copy"), "copywriter");
  assertStrictEquals(skinForTool("workshop_save_concepts"), "copywriter");
  assertStrictEquals(skinForTool("workshop_save_copy"), "copywriter");
  assertStrictEquals(skinForTool("workshop_produce_video"), "video_director");
  assertStrictEquals(skinForTool("workshop_make_creative"), "creative_studio");
  assertStrictEquals(skinForTool("create_lead"), null);
});
