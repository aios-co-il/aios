import { expect, test } from "vitest";
import {
  brandFromPayload,
  brandNameFromPayload,
} from "../src/compose/brand.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { loadFilmBrand, loadFilmSettings } from "../src/jobs/render.mjs";
import {
  captionChunks,
  wordsFromAlignment,
  wordsToFrames,
} from "../src/compose/captions.mjs";
import {
  fitScenes,
  musicEnvelope,
  sceneTransition,
  speechSpans,
  transitionFrames,
} from "../src/compose/workshop-edit.mjs";

test("word timings come from character alignments and word lists", () => {
  expect(
    wordsFromAlignment({
      characters: ["א", "ב", " ", "ג", "."],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
    }),
  ).toStrictEqual([
    { text: "אב", start: 0, end: 0.2 },
    { text: "ג.", start: 0.3, end: 0.5 },
  ]);
  expect(
    wordsFromAlignment({ words: [{ word: "שלום", start: 1, end: 0.5 }] }),
  ).toStrictEqual([{ text: "שלום", start: 1, end: 1 }]);
  expect(wordsFromAlignment(null)).toStrictEqual([]);
  expect(wordsFromAlignment({ characters: "x" })).toStrictEqual([]);
  expect(
    wordsToFrames([{ text: "a", start: 0, end: 0 }], 30, 60),
  ).toStrictEqual([{ text: "a", startFrame: 60, endFrame: 61 }]);
});

test("captions break after five words, a pause or a sentence end", () => {
  const at = (text, startFrame) => ({
    text,
    startFrame,
    endFrame: startFrame + 6,
  });
  const words = [
    at("אחת", 0),
    at("שתיים", 8),
    at("שלוש", 16),
    at("ארבע", 24),
    at("חמש", 32),
    at("שש.", 40),
    at("שבע", 48),
    at("שמונה", 100),
  ];
  const chunks = captionChunks(words, 30);
  expect(chunks.map((c) => c.words.map((w) => w.text).join(" "))).toStrictEqual(
    ["אחת שתיים שלוש ארבע חמש", "שש.", "שבע", "שמונה"],
  );
  expect(chunks[0].endFrame).toBe(40);
  expect(chunks[2].endFrame).toBe(66);
  expect(captionChunks(words, 30, 50).length).toBe(3);
});

test("transitions default to a varied cycle and never exceed a third of a scene", () => {
  expect(sceneTransition(0, "slide")).toBe("cut");
  expect([1, 2, 3, 4, 5].map((i) => sceneTransition(i))).toStrictEqual([
    "crossfade",
    "slide",
    "zoom",
    "wipe",
    "crossfade",
  ]);
  expect(sceneTransition(2, "bogus")).toBe("slide");
  expect(sceneTransition(2, "cut")).toBe("cut");
  expect(transitionFrames(90, 90, "zoom")).toBe(15);
  expect(transitionFrames(90, 30, "zoom")).toBe(10);
  expect(transitionFrames(90, 90, "cut")).toBe(0);
});

test("fitScenes stretches in proportion and leaves long pictures alone", () => {
  expect(fitScenes([30, 60], 180)).toStrictEqual([60, 120]);
  expect(fitScenes([30, 30, 30], 100)).toStrictEqual([33, 33, 34]);
  expect(fitScenes([90], 30)).toStrictEqual([90]);
  expect(fitScenes([90], 0)).toStrictEqual([90]);
});

test("the music bed ducks under speech and recovers between lines", () => {
  expect(
    speechSpans(
      [
        [50, 60],
        [0, 10],
        [20, 30],
      ],
      18,
    ),
  ).toStrictEqual([
    [0, 30],
    [50, 60],
  ]);
  expect(
    musicEnvelope(
      [
        [40, 100],
        [200, 260],
      ],
      300,
    ),
  ).toStrictEqual({
    frames: [0, 32, 40, 100, 114, 192, 200, 260, 274, 300],
    volumes: [0.2, 0.2, 0.06, 0.06, 0.2, 0.2, 0.06, 0.06, 0.2, 0.2],
  });
  expect(musicEnvelope([], 90)).toStrictEqual({
    frames: [0, 90],
    volumes: [0.2, 0.2],
  });
  const tail = musicEnvelope([[60, 90]], 90);
  expect(tail.frames).toStrictEqual([0, 52, 60, 90]);
  expect(tail.volumes.at(-1)).toBe(0.06);
});

test("brandFromPayload reads the brand kit fields and drops unsafe values", () => {
  expect(
    brandFromPayload({
      logo_url: " https://x.supabase.co/logo.png ",
      client_website: "https://www.example.co.il/",
      cta_text: "דברו איתנו",
      brand_book: {
        colors: ["nope", "#0F766E", "#f59e0b"],
        fonts: ["<script>", "Assistant"],
      },
    }),
  ).toStrictEqual({
    primaryColor: "#0F766E",
    secondaryColor: "#f59e0b",
    logoUrl: "https://x.supabase.co/logo.png",
    fontFamily: "Assistant",
    ctaText: "דברו איתנו",
    ctaUrl: "www.example.co.il",
  });
  expect(
    brandFromPayload({ brand_book: { logoUrl: "t/logo.png" } }).logoUrl,
  ).toBe("t/logo.png");
  expect(brandFromPayload({})).toBe(null);
  expect(brandFromPayload(null)).toBe(null);
});

test("loadFilmBrand reads the payload of the run's item in the run's tenant", async () => {
  const queries = [];
  const db = {
    async select(table, query) {
      queries.push([table, query]);
      return [{ payload: { cta_text: "קנו" } }];
    },
  };
  const brand = await loadFilmBrand(db, { item_id: "i 1", tenant_id: "t1" });
  expect(brand.ctaText).toBe("קנו");
  expect(queries).toStrictEqual([
    ["marketing_work_items", "id=eq.i%201&tenant_id=eq.t1&select=payload"],
  ]);
});

test("loadFilmSettings reads the caption style and the brand's name", async () => {
  const settingsFor = (payload) =>
    loadFilmSettings(
      { select: async () => [{ payload }] },
      { item_id: "i1", tenant_id: "t1" },
    );
  const motion = await settingsFor({ brand_book: { name: "כרמן" } });
  expect(motion.captionStyle).toBe("motion");
  expect(motion.brandName).toBe("כרמן");
  const karaoke = await settingsFor({ video: { caption_style: "karaoke" } });
  expect(karaoke.captionStyle).toBe("karaoke");
  expect(karaoke.brandName).toBe(null);
  expect(brandNameFromPayload({ client_name: "  Carmen  OS " })).toBe(
    "Carmen OS",
  );
});

test("buildTimeline carries the caption style, brand name and skin-switch signals", () => {
  const timeline = buildTimeline(
    [
      {
        id: "a",
        position: 1,
        clipPath: "a.mp4",
        skinSwitch: true,
        skinRef: "https://x/skin.jpg",
        pictureKey: "https://x/skin.jpg",
      },
      { id: "b", position: 2, clipPath: "b.mp4", skinSwitch: "yes" },
    ],
    { captionStyle: "karaoke", brandName: " כרמן " },
  );
  expect(timeline.captionStyle).toBe("karaoke");
  expect(timeline.brandName).toBe("כרמן");
  expect(timeline.scenes[0]).toMatchObject({
    skinSwitch: true,
    skinRef: "https://x/skin.jpg",
    pictureKey: "https://x/skin.jpg",
  });
  expect(timeline.scenes[1]).toMatchObject({
    skinSwitch: null,
    skinRef: null,
    pictureKey: null,
  });
  expect(buildTimeline([]).captionStyle).toBe("motion");
});

test("buildTimeline carries lip-sync, transitions, word timings and the brand", () => {
  const timeline = buildTimeline(
    [
      {
        id: "a",
        position: 1,
        clipPath: "a.mp4",
        lipsync: true,
        transition: "wipe",
        voicePath: "a.mp3",
        voiceAlignment: { words: [] },
      },
    ],
    { brand: { ctaText: "x" }, clipAudio: false },
  );
  expect(timeline.scenes[0].lipsync).toBe(true);
  expect(timeline.scenes[0].transition).toBe("wipe");
  expect(timeline.scenes[0].voiceAlignment).toStrictEqual({ words: [] });
  expect(timeline.brand).toStrictEqual({ ctaText: "x" });
  expect(timeline.clipAudio).toBe(false);
  expect(timeline.narrationAlignment).toBe(null);
});
