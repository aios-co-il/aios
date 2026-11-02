import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { MAX_CTA_LINES, endCardSeconds } from "../src/compose/end-card.mjs";
import {
  MUSIC_TAIL_S,
  MUSIC_USD_PER_MINUTE,
  PLANNED_HEADROOM,
  musicCostUsd,
  quotedMusicMs,
} from "../src/jobs/music-length.mjs";
import { generateMusic } from "../src/jobs/sound.mjs";
import { musicDb, run, stubMusic } from "./music-fixtures.mjs";

test("the music run asks ElevenLabs for the film's length and pays once", async () => {
  const bodies = stubMusic();
  try {
    // A quote of $0.50 buys a minute: more than this film needs.
    const r = run({ estimate: { usd: 0.5, credits: 0 } });
    const db = musicDb(r);
    const { inserts } = db;
    const done = await generateMusic({
      db,
      run: r,
      apiKey: "xi",
      log: () => {},
    });
    expect(bodies.length).toBe(1);
    const asked = bodies[0].music_length_ms;
    expect(asked).toBeGreaterThan(20_000);
    // The run records what this length costs, not the quote.
    expect(done.costUsd).toBe(musicCostUsd(asked));
    expect(done.costUsd).toBeCloseTo((asked / 60_000) * 0.5, 4);
    expect(done.costUsd).toBeLessThan(0.5);
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
    const fallback = run({ estimate: { usd: 0.5, credits: 0 } });
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

test("the bed never costs more than its quote; the render loops the rest", async () => {
  const bodies = stubMusic();
  try {
    // The narration stretches the planned 10.5 s by a third; the quote priced 15% headroom,
    // the longest end card and the tail: 20.575 s, $0.17 after rounding, so 20.4 s.
    const quoted = run({ estimate: { usd: 0.17, credits: 0 } });
    expect(quotedMusicMs(quoted)).toBe(20_400);
    const done = await generateMusic({
      db: musicDb(quoted),
      run: quoted,
      apiKey: "xi",
      log: () => {},
    });
    expect(bodies[0].music_length_ms).toBe(20_400);
    expect(quoted.output.audio_meta.music_basis).toBe("quote");
    expect(done.costUsd).toBe(0.17);
    // A run without a quote (queued before the bed was sized) asks for its planned length.
    const old = run();
    expect(quotedMusicMs(old)).toBe(10_500);
    const plain = await generateMusic({
      db: musicDb(old),
      run: old,
      apiKey: "xi",
      log: () => {},
    });
    expect(bodies[1].music_length_ms).toBe(10_500);
    expect(plain.costUsd).toBe(0.0875);
    // The planned length is the floor, and ElevenLabs' 5 minutes the ceiling.
    expect(quotedMusicMs(run({ estimate: { usd: 0.01 } }))).toBe(10_500);
    expect(quotedMusicMs(run({ estimate: { usd: 99 } }))).toBe(300_000);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("without an ElevenLabs key the music run fails at once, without waiting for the narration", async () => {
  const r = run({ estimate: { usd: 0.5 } });
  let sized = 0;
  await expect(
    generateMusic({
      db: musicDb(r, { pending: [{ id: "voice-run" }] }),
      run: r,
      apiKey: null,
      sizeMusic: async () => {
        sized += 1;
        return { ms: 20_000, basis: "narration", filmS: 16 };
      },
      log: () => {},
    }),
  ).rejects.toMatchObject({ final: true });
  expect(sized).toBe(0);
});

test("the quote prices what the worker may ask for, at the same rate", () => {
  const prices = readFileSync(
    new URL(
      "../../supabase/functions/_shared/workshop/clip-prices.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const constant = (name) =>
    Number(new RegExp(`export const ${name} = ([0-9.]+);`).exec(prices)?.[1]);
  expect(constant("MUSIC_USD_PER_MINUTE")).toBe(MUSIC_USD_PER_MINUTE);
  expect(constant("MUSIC_HEADROOM")).toBe(PLANNED_HEADROOM);
  // The longest end card (a three-line call to action) and the tail.
  expect(constant("MUSIC_EXTRA_S")).toBe(
    endCardSeconds(Array(MAX_CTA_LINES).fill("x")) + MUSIC_TAIL_S,
  );
});
