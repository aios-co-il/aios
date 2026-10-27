import { expect, test, vi } from "vitest";
import { endCardSeconds, ctaLines } from "../src/compose/end-card.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
import {
  MUSIC_TAIL_S,
  PLANNED_HEADROOM,
  filmSeconds,
  musicLengthMs,
} from "../src/jobs/music-length.mjs";
import { generateMusic } from "../src/jobs/sound.mjs";

const TENANT = "t1";
const ITEM = "item1";
const CTA =
  "הירשמו לרשימת ההמתנה — 1000 הנרשמים הראשונים יקבלו את חבילת הבסיס בחינם לכל החיים!";

const LINES = ["שלום לכולם", "זאת כרמן", "הירשמו עכשיו"];
const SCRIPT = LINES.join(" ");

/** The take's character alignment: each line spoken across [from, to] seconds. */
function take(spans) {
  const alignment = {
    characters: [],
    character_start_times_seconds: [],
    character_end_times_seconds: [],
  };
  spans.forEach(([from, to], index) => {
    const chars = [...(index ? ` ${LINES[index]}` : LINES[index])];
    const step = (to - from) / chars.length;
    chars.forEach((ch, i) => {
      alignment.characters.push(ch);
      alignment.character_start_times_seconds.push(from + i * step);
      alignment.character_end_times_seconds.push(from + (i + 1) * step);
    });
  });
  return alignment;
}
// Three 3.5 s scenes (10.5 s planned); the narration runs 14 s.
const ALIGNMENT = take([
  [0, 3],
  [4.5, 9],
  [10, 14],
]);

const scenes = () =>
  LINES.map((line, index) => ({
    id: `s${index + 1}`,
    position: index + 1,
    duration_s: 3.5,
    voiceover_text: line,
    voice_asset_id: null,
    meta: {},
  }));

function filmDb({
  narration = null,
  pending = [],
  payload = { cta_text: CTA },
  rows = scenes(),
} = {}) {
  const queries = [];
  return {
    queries,
    async select(table, query) {
      queries.push([table, query]);
      if (table === "marketing_video_scenes") return rows;
      if (table === "marketing_work_items")
        return query.includes("select=payload")
          ? [{ payload }]
          : [{ id: ITEM, tenant_id: TENANT, client_id: null }];
      if (table === "marketing_runs")
        return typeof pending === "function" ? pending() : pending;
      if (table === "marketing_assets" && query.includes("type=eq.narration"))
        return typeof narration === "function" ? narration() : narration;
      return [];
    },
  };
}

const run = (input = {}) => ({
  id: "music-1",
  tenant_id: TENANT,
  item_id: ITEM,
  stage_id: "st",
  input: { prompt: "restrained trailer", music_length_ms: 10_500, ...input },
  output: {},
});

const narrationRow = (text = SCRIPT) => [
  {
    url: `${TENANT}/general/${ITEM}/narration/voice-1.audio`,
    meta: { text, alignment: ALIGNMENT },
  },
];

test("the bed covers the film the edit cuts from the narration, its end card and a tail", async () => {
  const sized = await musicLengthMs({
    db: filmDb({ narration: narrationRow() }),
    run: run(),
    log: () => {},
  });
  // The same scenes the Remotion edit makes from these word timings.
  const { manifest } = buildWorkshopManifest({
    narrationPath: "/tmp/n.mp3",
    narrationAlignment: ALIGNMENT,
    scenes: LINES.map((line, index) => ({
      id: `s${index + 1}`,
      clipPath: "/tmp/c.mp4",
      stillPath: "/tmp/s.png",
      clipProvider: "mock",
      durationS: 3.5,
      narrationText: line,
    })),
  });
  const scenesS = manifest.totalFrames / manifest.fps;
  expect(scenesS).toBeGreaterThan(14);
  const cardS = endCardSeconds(ctaLines(CTA));
  expect(cardS).toBe(4.5);
  expect(sized.basis).toBe("narration");
  expect(sized.ms).toBe(Math.round((scenesS + cardS + MUSIC_TAIL_S) * 1000));
  // The storyboard's planned 10.5 s would leave the last 8 s of this film without music.
  expect(sized.ms).toBeGreaterThan(10_500 + 7_000);
});

test("a narration still being made is waited for, a bounded time", async () => {
  let ready = false;
  let now = 0;
  const lines = [];
  const sized = await musicLengthMs({
    db: filmDb({
      narration: () => (ready ? narrationRow() : []),
      pending: () => (ready ? [] : [{ id: "voice-run" }]),
    }),
    run: run(),
    now: () => now,
    sleep: async (ms) => {
      now += ms;
      if (now >= 15_000) ready = true;
    },
    log: (line) => lines.push(line),
  });
  expect(sized.basis).toBe("narration");
  expect(now).toBe(15_000);
  expect(lines.length).toBe(3);
  // A voice run that never finishes: the planned film with headroom, after the wait.
  now = 0;
  const late = await musicLengthMs({
    db: filmDb({ narration: [], pending: [{ id: "voice-run" }] }),
    run: run(),
    waitMs: 60_000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    log: () => {},
  });
  expect(now).toBe(60_000);
  expect(late.basis).toBe("headroom");
  expect(late.ms).toBe(
    Math.round((10.5 * (1 + PLANNED_HEADROOM) + 4.5 + MUSIC_TAIL_S) * 1000),
  );
});

test("a film without narration is the storyboard and its end card; an old take is not used", async () => {
  const silent = await musicLengthMs({
    db: filmDb({
      rows: scenes().map((scene) => ({ ...scene, voiceover_text: "" })),
      payload: {},
    }),
    run: run(),
    log: () => {},
  });
  expect(silent).toMatchObject({ basis: "planned", filmS: 10.5 });
  expect(silent.ms).toBe((10.5 + MUSIC_TAIL_S) * 1000);
  // A take of an older script, and no voice run: the narration is due but unknown.
  const stale = await musicLengthMs({
    db: filmDb({ narration: narrationRow("טקסט ישן") }),
    run: run(),
    log: () => {},
  });
  expect(stale.basis).toBe("headroom");
});

test("filmSeconds counts each scene's own voice in a talking film", () => {
  const talking = scenes().map((scene, index) => ({
    ...scene,
    meta: index === 0 ? { lipsync: true } : {},
  }));
  const voices = new Map([["s2", 6]]);
  const { seconds, basis } = filmSeconds({
    scenes: talking,
    narration: null,
    voices,
    expectsNarration: false,
  });
  expect(basis).toBe("planned");
  // Scene 2 lasts its 6 s voice plus the half-second tail.
  expect(seconds).toBeCloseTo(3.5 + 6.5 + 3.5, 5);
});

test("the music run asks ElevenLabs for the film's length and pays once", async () => {
  const bodies = [];
  vi.stubGlobal("fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
  try {
    const r = run();
    const inserts = [];
    const base = filmDb({ narration: narrationRow() });
    const db = {
      ...base,
      async upload() {},
      async update(_table, _filter, patch) {
        r.output = patch.output;
      },
      async insert(table, row) {
        inserts.push([table, row]);
      },
    };
    const done = await generateMusic({
      db,
      run: r,
      apiKey: "xi",
      log: () => {},
    });
    expect(done.costUsd).toBe(0);
    expect(bodies.length).toBe(1);
    const asked = bodies[0].music_length_ms;
    expect(asked).toBeGreaterThan(20_000);
    expect(r.output.audio_meta).toStrictEqual({
      music_length_ms: asked,
      music_basis: "narration",
    });
    expect(inserts[0][1].meta.music_length_ms).toBe(asked);
    // A retry after the payment keeps the stored bed and its length; nothing is sized again.
    let sized = 0;
    await generateMusic({
      db,
      run: r,
      apiKey: "xi",
      sizeMusic: async () => {
        sized += 1;
        return { ms: 1, basis: "x", filmS: 0 };
      },
      log: () => {},
    });
    expect(sized).toBe(0);
    expect(bodies.length).toBe(1);
    // When the film cannot be read, the run's planned length is used as before.
    const fallback = run();
    await generateMusic({
      db: { ...db, update: async () => {} },
      run: fallback,
      apiKey: "xi",
      sizeMusic: async () => {
        throw new Error("db down");
      },
      log: () => {},
    });
    expect(bodies[1].music_length_ms).toBe(10_500);
  } finally {
    vi.unstubAllGlobals();
  }
});
