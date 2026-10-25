import assert from "node:assert/strict";
import { test } from "node:test";
import { brandFromPayload } from "../src/compose/brand.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { loadFilmBrand } from "../src/jobs/render.mjs";
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
  assert.deepEqual(
    wordsFromAlignment({
      characters: ["א", "ב", " ", "ג", "."],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5],
    }),
    [
      { text: "אב", start: 0, end: 0.2 },
      { text: "ג.", start: 0.3, end: 0.5 },
    ],
  );
  assert.deepEqual(
    wordsFromAlignment({ words: [{ word: "שלום", start: 1, end: 0.5 }] }),
    [{ text: "שלום", start: 1, end: 1 }],
  );
  assert.deepEqual(wordsFromAlignment(null), []);
  assert.deepEqual(wordsFromAlignment({ characters: "x" }), []);
  assert.deepEqual(wordsToFrames([{ text: "a", start: 0, end: 0 }], 30, 60), [
    { text: "a", startFrame: 60, endFrame: 61 },
  ]);
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
  assert.deepEqual(
    chunks.map((c) => c.words.map((w) => w.text).join(" ")),
    ["אחת שתיים שלוש ארבע חמש", "שש.", "שבע", "שמונה"],
  );
  assert.equal(chunks[0].endFrame, 40);
  assert.equal(chunks[2].endFrame, 66);
  assert.equal(captionChunks(words, 30, 50).length, 3);
});

test("transitions default to a varied cycle and never exceed a third of a scene", () => {
  assert.equal(sceneTransition(0, "slide"), "cut");
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((i) => sceneTransition(i)),
    ["crossfade", "slide", "zoom", "wipe", "crossfade"],
  );
  assert.equal(sceneTransition(2, "bogus"), "slide");
  assert.equal(sceneTransition(2, "cut"), "cut");
  assert.equal(transitionFrames(90, 90, "zoom"), 15);
  assert.equal(transitionFrames(90, 30, "zoom"), 10);
  assert.equal(transitionFrames(90, 90, "cut"), 0);
});

test("fitScenes stretches in proportion and leaves long pictures alone", () => {
  assert.deepEqual(fitScenes([30, 60], 180), [60, 120]);
  assert.deepEqual(fitScenes([30, 30, 30], 100), [33, 33, 34]);
  assert.deepEqual(fitScenes([90], 30), [90]);
  assert.deepEqual(fitScenes([90], 0), [90]);
});

test("the music bed ducks under speech and recovers between lines", () => {
  assert.deepEqual(
    speechSpans(
      [
        [50, 60],
        [0, 10],
        [20, 30],
      ],
      18,
    ),
    [
      [0, 30],
      [50, 60],
    ],
  );
  assert.deepEqual(
    musicEnvelope(
      [
        [40, 100],
        [200, 260],
      ],
      300,
    ),
    {
      frames: [0, 32, 40, 100, 114, 192, 200, 260, 274, 300],
      volumes: [0.2, 0.2, 0.06, 0.06, 0.2, 0.2, 0.06, 0.06, 0.2, 0.2],
    },
  );
  assert.deepEqual(musicEnvelope([], 90), {
    frames: [0, 90],
    volumes: [0.2, 0.2],
  });
  const tail = musicEnvelope([[60, 90]], 90);
  assert.deepEqual(tail.frames, [0, 52, 60, 90]);
  assert.equal(tail.volumes.at(-1), 0.06);
});

test("brandFromPayload reads the brand kit fields and drops unsafe values", () => {
  assert.deepEqual(
    brandFromPayload({
      logo_url: " https://x.supabase.co/logo.png ",
      client_website: "https://www.example.co.il/",
      cta_text: "דברו איתנו",
      brand_book: {
        colors: ["nope", "#0F766E", "#f59e0b"],
        fonts: ["<script>", "Assistant"],
      },
    }),
    {
      primaryColor: "#0F766E",
      secondaryColor: "#f59e0b",
      logoUrl: "https://x.supabase.co/logo.png",
      fontFamily: "Assistant",
      ctaText: "דברו איתנו",
      ctaUrl: "www.example.co.il",
    },
  );
  assert.equal(
    brandFromPayload({ brand_book: { logoUrl: "t/logo.png" } }).logoUrl,
    "t/logo.png",
  );
  assert.equal(brandFromPayload({}), null);
  assert.equal(brandFromPayload(null), null);
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
  assert.equal(brand.ctaText, "קנו");
  assert.deepEqual(queries, [
    ["marketing_work_items", "id=eq.i%201&tenant_id=eq.t1&select=payload"],
  ]);
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
  assert.equal(timeline.scenes[0].lipsync, true);
  assert.equal(timeline.scenes[0].transition, "wipe");
  assert.deepEqual(timeline.scenes[0].voiceAlignment, { words: [] });
  assert.deepEqual(timeline.brand, { ctaText: "x" });
  assert.equal(timeline.clipAudio, false);
  assert.equal(timeline.narrationAlignment, null);
});
