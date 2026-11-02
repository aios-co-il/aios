import { expect, test } from "vitest";
import { endCardSeconds, ctaLines } from "../src/compose/end-card.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
import {
  MUSIC_TAIL_S,
  PLANNED_HEADROOM,
  filmSeconds,
  musicLengthMs,
} from "../src/jobs/music-length.mjs";
import {
  ALIGNMENT,
  CTA,
  LINES,
  filmDb,
  narrationRow,
  run,
  scenes,
  take,
} from "./music-fixtures.mjs";

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

test("a talking film is timed by each scene's own voice of its current line only", async () => {
  const rows = scenes().map((scene, index) => ({
    ...scene,
    voice_asset_id: `v${index + 1}`,
    meta: index === 0 ? { lipsync: true, dialogue: "אני כרמן" } : {},
  }));
  const voice = (id, text, to) => ({
    id,
    type: "voiceover",
    meta: { text, alignment: take([[0, to]]) },
  });
  const assets = [
    voice("v1", "אני כרמן", 6),
    voice("v2", LINES[1], 7),
    // Made for an older line: the render does not play it, so it does not time the scene.
    voice("v3", "שורה ישנה", 9),
  ];
  const db = filmDb({ rows, payload: {} });
  const select = db.select;
  db.select = async (table, query) => {
    if (!(table === "marketing_assets" && query.startsWith("id=in.")))
      return select(table, query);
    db.queries.push([table, query]);
    return assets;
  };
  const sized = await musicLengthMs({ db, run: run(), log: () => {} });
  expect(sized.basis).toBe("planned");
  // 6.5 s and 7.5 s (each voice plus its tail), and the stale third scene's planned 3.5 s.
  expect(sized.filmS).toBeCloseTo(6.5 + 7.5 + 3.5, 1);
  // Every filter carries the run's tenant.
  expect(db.queries.length).toBeGreaterThan(3);
  for (const [, query] of db.queries)
    expect(query).toContain("tenant_id=eq.t1");
});
