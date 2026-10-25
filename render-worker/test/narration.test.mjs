import assert from "node:assert/strict";
import test from "node:test";
import { loadFilmSources } from "../src/jobs/render.mjs";
import { joinNarration, spokenLine } from "../src/narration.mjs";

test("joinNarration makes one continuous script and skips blank lines", () => {
  assert.equal(
    joinNarration(["  כרמן יושבת  ", "", "   ", "ועובדת ליד המחשב"]),
    "כרמן יושבת ועובדת ליד המחשב",
  );
  assert.equal(joinNarration(["רק משפט אחד"]), "רק משפט אחד");
  assert.equal(joinNarration([null, "  "]), "");
});

test("spokenLine trims the same characters the database trims", () => {
  assert.equal(spokenLine("\t כרמן יושבת\r\n"), "כרמן יושבת");
  assert.equal(spokenLine("\u00a0מילה\u00a0"), "\u00a0מילה\u00a0");
  assert.equal(spokenLine(null), "");
});

/** Answers loadFilmSources' reads from the table name and query. */
function fakeDb({ scenes, assets, narration }) {
  return {
    async select(table, query) {
      if (table === "marketing_video_scenes")
        return query.includes("clip_asset_id=not.is.null")
          ? scenes.filter((scene) => scene.clip_asset_id)
          : scenes;
      if (query.includes("type=eq.narration")) return narration ? [narration] : [];
      if (query.includes("type=eq.music")) return [];
      return assets;
    },
  };
}

const run = { item_id: "item-1", tenant_id: "tenant-1" };

test("the continuous narration is used only when every spoken scene is in the film", async () => {
  const assets = [
    { id: "clip-1", url: "t/clip-1.mp4", meta: {} },
    { id: "clip-2", url: "t/clip-2.mp4", meta: {} },
  ];
  const narration = { url: "t/narration.mp3", meta: { text: "אחת שתיים" } };
  const full = await loadFilmSources(
    fakeDb({
      scenes: [
        { id: "s1", position: 1, voiceover_text: "אחת\n", clip_asset_id: "clip-1" },
        { id: "s2", position: 2, voiceover_text: "שתיים", clip_asset_id: "clip-2" },
      ],
      assets,
      narration,
    }),
    run,
  );
  assert.equal(full.narrationPath, "t/narration.mp3");

  await assert.rejects(
    loadFilmSources(
      fakeDb({
        scenes: [
          { id: "s1", position: 1, voiceover_text: "אחת", clip_asset_id: "clip-1" },
          { id: "s2", position: 2, voiceover_text: "שתיים", clip_asset_id: null },
        ],
        assets,
        narration,
      }),
      run,
    ),
    /narration missing/,
  );
});
