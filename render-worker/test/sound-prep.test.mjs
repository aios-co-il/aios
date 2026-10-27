import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { EFFECT_LUFS } from "../src/compose/music-bed.mjs";
import { levelGain, prepareSound } from "../src/compose/sound-prep.mjs";
import { measureLoudness, parseLoudness } from "../src/ffmpeg.mjs";
import { hasFfmpeg, media } from "./media.mjs";

test.skipIf(!hasFfmpeg)(
  "a loud whoosh and a quiet decaying impact hit at the same level after levelling",
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
        { scenes: [], effects: { whooshPath: loud, impactPath: quiet } },
        join(dir, "sound"),
        { log: () => {} },
      );
      for (const file of Object.values(prepared.effects)) {
        const after = await measureLoudness(file);
        expect(Math.abs(after.maxMomentary - EFFECT_LUFS)).toBeLessThan(1);
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
    "/i.mp3": { integrated: -24.7, truePeak: -6.3, maxMomentary: -18.3 },
    "/n.mp3": { integrated: -19.1, truePeak: -1.6, maxMomentary: -13.2 },
  };
  const written = [];
  const prepared = await prepareSound(
    {
      musicPath: "/m.mp3",
      narrationPath: "/n.mp3",
      effects: { whooshPath: "/w.mp3", impactPath: "/i.mp3" },
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
    whooshPath: "/out/sfx-whoosh-levelled.wav",
    impactPath: "/out/sfx-impact-levelled.wav",
  });
  expect(prepared.voiceLufs).toBe(-19.1);
  const gains = Object.fromEntries(written.map(([f, , g]) => [f, g.gainDb]));
  expect(gains["/m.mp3"]).toBe(3);
  // The whoosh and the impact land on the same hit level (15 LU apart before).
  expect(-9.2 + gains["/w.mp3"]).toBeCloseTo(EFFECT_LUFS, 5);
  expect(-18.3 + gains["/i.mp3"]).toBeCloseTo(EFFECT_LUFS, 5);
  // A file that cannot be measured or written keeps its own level.
  const kept = await prepareSound(
    { musicPath: "/m.mp3", effects: { whooshPath: "/w.mp3" }, scenes: [] },
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
  expect(kept.effects.whooshPath).toBe("/w.mp3");
  expect(kept.voiceLufs).toBe(null);
});
