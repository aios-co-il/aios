import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
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
      if (query.includes("type=eq.narration"))
        return narration ? [narration] : [];
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
  const alignment = { characters: ["א"], character_start_times_seconds: [0] };
  const narration = {
    url: "t/narration.mp3",
    meta: { text: "אחת שתיים", alignment },
  };
  const full = await loadFilmSources(
    fakeDb({
      scenes: [
        {
          id: "s1",
          position: 1,
          voiceover_text: "אחת\n",
          clip_asset_id: "clip-1",
        },
        {
          id: "s2",
          position: 2,
          voiceover_text: "שתיים",
          clip_asset_id: "clip-2",
        },
      ],
      assets,
      narration,
    }),
    run,
  );
  assert.equal(full.narrationPath, "t/narration.mp3");
  // The word timings travel with the narration for karaoke captions.
  assert.deepEqual(full.narrationAlignment, alignment);

  await assert.rejects(
    loadFilmSources(
      fakeDb({
        scenes: [
          {
            id: "s1",
            position: 1,
            voiceover_text: "אחת",
            clip_asset_id: "clip-1",
          },
          {
            id: "s2",
            position: 2,
            voiceover_text: "שתיים",
            clip_asset_id: null,
          },
        ],
        assets,
        narration,
      }),
      run,
    ),
    /narration missing/,
  );
});

test("a continuous narration linked to each scene is never replayed as one scene's voice", async () => {
  // attach_video_narration points every spoken scene's voice_asset_id at the narration.
  const narration = {
    id: "narr-1",
    type: "narration",
    url: "t/narration.mp3",
    meta: { text: "אחת שתיים שלוש", alignment: { characters: ["א"] } },
  };
  const assets = [
    { id: "clip-1", url: "t/clip-1.mp4", meta: {} },
    { id: "clip-3", url: "t/clip-3.mp4", meta: {} },
    narration,
  ];
  const scene = (id, position, text, clip) => ({
    id,
    position,
    voiceover_text: text,
    clip_asset_id: clip,
    voice_asset_id: "narr-1",
  });
  await assert.rejects(
    loadFilmSources(
      fakeDb({
        scenes: [
          scene("s1", 1, "אחת", "clip-1"),
          scene("s2", 2, "שתיים", null),
          scene("s3", 3, "שלוש", "clip-3"),
        ],
        assets,
        narration,
      }),
      run,
    ),
    /narration missing/,
  );

  // A scene's own voiceover still plays when the narration does not cover the film.
  const own = await loadFilmSources(
    fakeDb({
      scenes: [
        { ...scene("s1", 1, "אחת", "clip-1"), voice_asset_id: "v1" },
        scene("s2", 2, "שתיים", null),
      ],
      assets: [
        ...assets,
        { id: "v1", type: "voiceover", url: "t/v1.mp3", meta: { text: "x" } },
      ],
      narration,
    }),
    run,
  );
  assert.equal(own.narrationPath, null);
  assert.equal(own.scenes[0].voicePath, "t/v1.mp3");
});

test("a talking clip made for an older line is muted and the new line plays as a voiceover", async () => {
  const assets = [
    {
      id: "clip-1",
      type: "video_clip",
      url: "t/talk.mp4",
      meta: { provider: "openrouter", lipsync: true, dialogue: "שורה ישנה" },
    },
    {
      id: "v1",
      type: "voiceover",
      url: "t/v1.mp3",
      meta: { text: "שורה חדשה" },
    },
  ];
  const scenes = [
    {
      id: "s1",
      position: 1,
      voiceover_text: "שורה חדשה",
      clip_asset_id: "clip-1",
      voice_asset_id: "v1",
      meta: { lipsync: true, dialogue: "" },
    },
  ];
  const sources = await loadFilmSources(fakeDb({ scenes, assets }), run);
  const [talking] = sources.scenes;
  assert.equal(talking.lipsync, false);
  assert.equal(talking.voicePath, "t/v1.mp3");
  const { manifest } = buildWorkshopManifest({
    aspect: "9:16",
    scenes: [
      {
        ...talking,
        clipPath: "/tmp/talk.mp4",
        voicePath: "/tmp/v1.mp3",
        clipHasAudio: true,
        clipDurationS: 5,
        voiceDurationS: 2,
      },
    ],
  });
  assert.equal(manifest.scenes[0].clipVolume, 0);

  // The clip of the current line still speaks it.
  assets[0].meta.dialogue = "שורה חדשה";
  const current = await loadFilmSources(fakeDb({ scenes, assets }), run);
  assert.equal(current.scenes[0].lipsync, true);
  assert.equal(current.scenes[0].voicePath, null);
});
