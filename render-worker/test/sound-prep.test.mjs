import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { EFFECT_LUFS, IMPACT_LUFS } from "../src/compose/music-bed.mjs";
import { levelGain, prepareSound } from "../src/compose/sound-prep.mjs";
import { measureLoudness, parseLoudness } from "../src/ffmpeg.mjs";
import { hasFfmpeg, media } from "./media.mjs";

test.skipIf(!hasFfmpeg)(
  "a loud transition sound and a quiet decaying impact each hit at its own level after levelling",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "sfx-level-"));
    try {
      const loud = join(dir, "whoosh.wav");
      const quiet = join(dir, "impact.wav");
      media(["-f", "lavfi", "-i", "anoisesrc=d=1.2:c=pink:a=1", loud]);
      media([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=120:duration=2.5",
        "-af",
        "afade=t=out:st=0.3:d=2.2",
        quiet,
      ]);
      const before = [
        await measureLoudness(loud),
        await measureLoudness(quiet),
      ];
      // Like the showcase's ElevenLabs pair: far apart, the impact mostly decaying tail.
      expect(before[0].integrated - before[1].integrated).toBeGreaterThan(10);
      const prepared = await prepareSound(
        { scenes: [], effects: { transitionPaths: [loud], impactPath: quiet } },
        join(dir, "sound"),
        { log: () => {} },
      );
      const targets = [
        [prepared.effects.transitionPaths[0], EFFECT_LUFS],
        [prepared.effects.impactPath, IMPACT_LUFS],
      ];
      for (const [file, target] of targets) {
        const after = await measureLoudness(file);
        expect(Math.abs(after.maxMomentary - target)).toBeLessThan(1);
        expect(after.truePeak).toBeLessThan(0);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

test("ffmpeg's ebur128 log gives the loudness, the hit and the end of a track's body", () => {
  const log = [
    "[Parsed_ebur128_0 @ 0x1] t: 0.1 TARGET:-23 LUFS M:-120.7 S:-120.7 I: -70.0 LUFS",
    "[Parsed_ebur128_0 @ 0x1] t: 0.4 TARGET:-23 LUFS M: -16.2 S:-120.7 I: -16.2 LUFS",
    "[Parsed_ebur128_0 @ 0x1] t: 0.5 TARGET:-23 LUFS M: -17.0 S:-120.7 I: -16.6 LUFS",
    "[Parsed_ebur128_0 @ 0x1] t: 0.6 TARGET:-23 LUFS M: -30.5 S:-120.7 I: -17.0 LUFS",
    "[Parsed_ebur128_0 @ 0x1] t: 0.7 TARGET:-23 LUFS M: -55.0 S:-120.7 I: -17.0 LUFS",
    "[Parsed_ebur128_0 @ 0x1] Summary:",
    "",
    "  Integrated loudness:",
    "    I:         -17.2 LUFS",
    "    Threshold: -27.5 LUFS",
    "",
    "  True peak:",
    "    Peak:       -6.7 dBFS",
  ].join("\n");
  expect(parseLoudness(log)).toStrictEqual({
    integrated: -17.2,
    truePeak: -6.7,
    maxMomentary: -16.2,
    bodyEndS: 0.5,
  });
  expect(
    parseLoudness("Summary:\n Integrated loudness:\n I: -70.0 LUFS"),
  ).toMatchObject({ integrated: null, maxMomentary: null, bodyEndS: null });
});

test("levelGain reaches the target and keeps peaks under the ceiling", () => {
  // The showcase whoosh (hit -9.2, peak +0.6) and impact (hit -18.3, peak -6.3).
  expect(
    levelGain({ measured: -9.2, target: EFFECT_LUFS, peak: 0.6 }),
  ).toStrictEqual({ gainDb: -4.8, limit: false });
  expect(
    levelGain({ measured: -18.3, target: EFFECT_LUFS, peak: -6.3 }),
  ).toStrictEqual({ gainDb: 4.3, limit: false });
  // A quiet track with high peaks is limited, and never boosted past 6 dB of limiting.
  expect(levelGain({ measured: -25, target: -17, peak: -3 })).toStrictEqual({
    gainDb: 8,
    limit: true,
  });
  expect(levelGain({ measured: -40, target: -17, peak: -2 }).gainDb).toBe(7);
  expect(levelGain({ measured: null, target: -17 })).toBe(null);
});

test("prepareSound levels the bed and every effect's hit, and measures the voice", async () => {
  const readings = {
    "/m.mp3": {
      integrated: -20,
      truePeak: -8,
      maxMomentary: -18,
      bodyEndS: 38,
    },
    "/w.mp3": { integrated: -10.1, truePeak: 0.6, maxMomentary: -9.2 },
    "/s.mp3": { integrated: -22, truePeak: -9, maxMomentary: -20 },
    "/i.mp3": { integrated: -24.7, truePeak: -6.3, maxMomentary: -18.3 },
    "/n.mp3": { integrated: -19.1, truePeak: -1.6, maxMomentary: -13.2 },
  };
  const written = [];
  const prepared = await prepareSound(
    {
      musicPath: "/m.mp3",
      narrationPath: "/n.mp3",
      effects: {
        transitionPaths: ["/w.mp3", "/s.mp3"],
        impactPath: "/i.mp3",
        seed: "film",
      },
      scenes: [],
    },
    "/out",
    {
      measure: async (file) => readings[file],
      normalize: async (file, out, gain) => written.push([file, out, gain]),
      log: () => {},
    },
  );
  expect(prepared.musicPath).toBe("/out/music-levelled.wav");
  expect(prepared.musicBodyS).toBe(38);
  expect(prepared.effects).toStrictEqual({
    transitionPaths: [
      "/out/sfx-cut-0-levelled.wav",
      "/out/sfx-cut-1-levelled.wav",
    ],
    impactPath: "/out/sfx-impact-levelled.wav",
    seed: "film",
  });
  expect(prepared.voiceLufs).toBe(-19.1);
  const gains = Object.fromEntries(written.map(([f, , g]) => [f, g.gainDb]));
  expect(gains["/m.mp3"]).toBe(3);
  // Every transition sound lands on the same hit level; the impact (15 LU under the whoosh
  // before) lands 3 LU softer.
  expect(-9.2 + gains["/w.mp3"]).toBeCloseTo(EFFECT_LUFS, 5);
  expect(-20 + gains["/s.mp3"]).toBeCloseTo(EFFECT_LUFS, 5);
  expect(-18.3 + gains["/i.mp3"]).toBeCloseTo(IMPACT_LUFS, 5);
  // A file that cannot be measured or written keeps its own level.
  const kept = await prepareSound(
    {
      musicPath: "/m.mp3",
      effects: { transitionPaths: ["/w.mp3"], impactPath: null },
      scenes: [],
    },
    "/out",
    {
      measure: async (file) => {
        if (file === "/w.mp3") throw new Error("unreadable");
        return readings[file];
      },
      normalize: async () => {
        throw new Error("disk full");
      },
      log: () => {},
    },
  );
  expect(kept.musicPath).toBe("/m.mp3");
  expect(kept.effects.transitionPaths).toStrictEqual(["/w.mp3"]);
  expect(kept.voiceLufs).toBe(null);
});

test("an ordinary film's bed keeps its own level and is only measured for its loop", async () => {
  const written = [];
  const options = {
    measure: async () => ({
      integrated: -12,
      truePeak: -1,
      maxMomentary: -10,
      bodyEndS: 30,
    }),
    normalize: async (file, out, gain) => written.push([file, out, gain]),
    log: () => {},
  };
  const plain = await prepareSound(
    { musicPath: "/m.mp3", narrationPath: "/n.mp3", scenes: [] },
    "/out",
    options,
  );
  expect(plain).toMatchObject({
    musicPath: "/m.mp3",
    musicBodyS: 30,
    voiceLufs: null,
  });
  expect(written).toStrictEqual([]);
  // A trailer brief without effects still gets its bed levelled for the trailer mix.
  const trailer = await prepareSound(
    { musicPath: "/m.mp3", soundDesign: true, scenes: [] },
    "/out",
    options,
  );
  expect(trailer.musicPath).toBe("/out/music-levelled.wav");
  expect(written.map(([, , gain]) => gain.gainDb)).toStrictEqual([-5]);
});
