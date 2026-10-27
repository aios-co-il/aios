import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  assembleFilm,
  envelopeExpression,
  musicBedFilters,
} from "../src/compose/assemble.mjs";
import { levelGain, prepareSound } from "../src/compose/sound-prep.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import {
  EFFECT_LUFS,
  MIX,
  MUSIC_LUFS,
  TRAILER,
  kickerTitle,
  mixProfile,
  musicEnvelope,
  musicLoops,
} from "../src/compose/workshop-edit.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
import { measureLoudness, parseLoudness } from "../src/ffmpeg.mjs";

const db = (gain) => 20 * Math.log10(gain);

const hasFfmpeg =
  spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const media = (args) => {
  const result = spawnSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...args,
  ]);
  if (result.status !== 0) throw new Error(String(result.stderr));
};
const meanDb = (file, from, length) => {
  const out = spawnSync(
    "ffmpeg",
    [
      "-ss",
      String(from),
      "-t",
      String(length),
      "-i",
      file,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  return Number(out.stderr.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1] ?? -91);
};

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

test.skipIf(!hasFfmpeg)(
  "the ffmpeg edit loops a short bed under the scenes and the end card",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "bed-loop-"));
    try {
      const clip = (name, color) => {
        const file = join(dir, `${name}.mp4`);
        media([
          "-f",
          "lavfi",
          "-i",
          `color=c=${color}:s=320x240:d=2`,
          "-pix_fmt",
          "yuv420p",
          file,
        ]);
        return file;
      };
      const music = join(dir, "music.wav");
      media([
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=330:duration=2",
        "-af",
        "volume=0.5",
        music,
      ]);
      const output = join(dir, "film.mp4");
      await assembleFilm(
        buildTimeline(
          [
            { id: "a", position: 1, clipPath: clip("a", "red"), durationS: 2 },
            { id: "b", position: 2, clipPath: clip("b", "blue"), durationS: 2 },
          ],
          { musicPath: music, brand: { ctaText: "הירשמו עכשיו" } },
        ),
        output,
      );
      // The 2 s track ends long before the 6.5 s film; the bed still plays under the second
      // scene and the end card, and fades with the film.
      expect(meanDb(output, 2.6, 0.6)).toBeGreaterThan(-40);
      expect(meanDb(output, 4.2, 0.6)).toBeGreaterThan(-40);
      expect(meanDb(output, 6.3, 0.2)).toBeLessThan(meanDb(output, 4.2, 0.6));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
  60_000,
);

test("a track shorter than the film is looped with a crossfade at its musical end", () => {
  // The showcase: a 42 s track whose body ends at 37.7 s, under a 52.1 s film (30 fps).
  const loops = musicLoops(1260, 1563, { bodyFrames: 1131 });
  expect(loops).toStrictEqual([
    { startFrame: 0, frameCount: 1131, fadeInFrames: 0, fadeOutFrames: 45 },
    { startFrame: 1086, frameCount: 477, fadeInFrames: 45, fadeOutFrames: 0 },
  ]);
  // Every frame of the film has music; the hand-over overlaps by the crossfade only.
  const last = loops.at(-1);
  expect(last.startFrame + last.frameCount).toBe(1563);
  expect(
    loops[0].frameCount - (loops[1].startFrame - loops[0].startFrame),
  ).toBe(45);
  // A long film takes as many copies as it needs.
  const many = musicLoops(300, 2000);
  expect(many.length).toBe(8);
  expect(many.at(-1).startFrame + many.at(-1).frameCount).toBe(2000);
  for (const [i, loop] of many.entries())
    if (i) expect(loop.startFrame).toBe(many[i - 1].startFrame + 300 - 45);
});

test("a track that covers the film stays one copy, also when its outro ends it", () => {
  expect(musicLoops(1500, 1400)).toStrictEqual([
    { startFrame: 0, frameCount: 1400, fadeInFrames: 0, fadeOutFrames: 0 },
  ]);
  // The body ends 0.9 s before the film's own 1.5 s fade: the track's outro plays out.
  expect(musicLoops(1683, 1563, { bodyFrames: 1490 }).length).toBe(1);
  // A body ending earlier starts a new copy instead of a dying tail.
  expect(musicLoops(1683, 1563, { bodyFrames: 1440 }).length).toBe(2);
  // A short outro that ends inside the film's fade is not left to silence either.
  const short = musicLoops(60, 197, { bodyFrames: 54 });
  expect(short.at(-1).startFrame + short.at(-1).frameCount).toBe(197);
  expect(short.every((loop) => loop.frameCount <= 60)).toBe(true);
  expect(musicLoops(0, 100)).toStrictEqual([]);
});

test("an ordinary film keeps today's mix; a trailer brings the bed up and 13.5 dB under the voice", () => {
  expect(mixProfile()).toMatchObject({
    trailer: false,
    music: MIX.music,
    musicDucked: MIX.musicDucked,
    effects: MIX.effects,
    hold: 0,
  });
  expect(MIX.music).toBe(0.2);
  expect(MIX.musicDucked).toBe(0.06);
  const trailer = mixProfile({ trailer: true, voiceLufs: -19.1 });
  // The bed is levelled to MUSIC_LUFS first, so these gains are loudness targets.
  const solo = MUSIC_LUFS + db(trailer.music);
  const under = MUSIC_LUFS + db(trailer.musicDucked);
  expect(solo).toBeCloseTo(TRAILER.bedLufs, 1);
  expect(solo).toBeGreaterThanOrEqual(-23);
  expect(solo).toBeLessThanOrEqual(-20);
  expect(-19.1 - under).toBeCloseTo(13.5, 1);
  // Today's bed sat about 22 dB under that voice; the trailer one is about 8 dB louder.
  expect(under - (MUSIC_LUFS + db(MIX.musicDucked))).toBeGreaterThan(7);
  // An unknown voice reads as an ElevenLabs take; an odd one is clamped.
  expect(mixProfile({ trailer: true }).musicDucked).toBeCloseTo(0.168, 2);
  expect(mixProfile({ trailer: true, voiceLufs: -60 }).musicDucked).toBe(
    mixProfile({ trailer: true, voiceLufs: -30 }).musicDucked,
  );
  // A loud voice never pushes the ducked bed over its own level between lines.
  const loud = mixProfile({ trailer: true, voiceLufs: -5 });
  expect(loud.musicDucked).toBeLessThanOrEqual(loud.music);
});

test("the trailer bed holds down through short pauses and comes up in long ones", () => {
  const spans = [
    [30, 300],
    [315, 600],
    [700, 900],
  ];
  const { attack, release, hold } = mixProfile({ trailer: true });
  const env = musicEnvelope(spans, 1000, {
    base: 1,
    ducked: 0.25,
    attack,
    release,
    hold,
  });
  const at = (frame) => {
    let i = 0;
    while (i < env.frames.length - 1 && env.frames[i + 1] <= frame) i += 1;
    return env.volumes[i];
  };
  // A half-second breath (15 frames) stays under; a 3 s gap and the ending come up.
  expect(at(307)).toBe(0.25);
  expect(at(650)).toBe(1);
  expect(at(950)).toBe(1);
  expect(at(10)).toBe(1);
  // A line from the first frames: the film (and its title impact) opens under the voice.
  expect(
    musicEnvelope([[2, 100]], 200, { base: 1, ducked: 0.25 }).volumes[0],
  ).toBe(0.25);
});

test("a short scene title becomes a kicker unless it repeats the line", () => {
  expect(kickerTitle("אנליסטית", "היא קוראת את הנתונים")).toBe("אנליסטית");
  expect(kickerTitle("SEO ו-GEO", "מקדמת אותך בגוגל")).toBe("SEO ו-GEO");
  // A name inside a longer line is still a title.
  expect(kickerTitle("כרמן", "הכירו את כרמן. מנהלת השיווק של העסק שלך.")).toBe(
    "כרמן",
  );
  expect(kickerTitle("  כרמן.   מנהלת השיווק שלך. ", "הירשמו")).toBe(
    "כרמן. מנהלת השיווק שלך.",
  );
  // The line itself, most of it, or a title that holds the whole line: no kicker.
  expect(kickerTitle("הכירו את כרמן!", "הכירו את כרמן")).toBe(null);
  expect(kickerTitle("מנהלת השיווק שלך", "מנהלת השיווק שלך היום")).toBe(null);
  expect(kickerTitle("יומן חכם לעסק", "יומן")).toBe(null);
  // Niqqud, punctuation and case do not hide a repeat.
  expect(kickerTitle("הַכִּירוּ אֶת כַּרְמֵן", "הכירו את כרמן.")).toBe(null);
  expect(kickerTitle("SEO, GEO", "seo geo")).toBe(null);
  // Too long: six words, or more than 32 characters.
  expect(kickerTitle("אחת שתיים שלוש ארבע חמש שש", "")).toBe(null);
  expect(kickerTitle("כותרת ארוכה מאוד שלא נכנסת בשורה אחת", "")).toBe(null);
  expect(kickerTitle("", "x")).toBe(null);
  expect(kickerTitle("!!!", "")).toBe(null);
});

const still = (id, extra = {}) => ({
  id,
  clipPath: `/tmp/${id}.mp4`,
  stillPath: `/tmp/${id}.png`,
  clipProvider: "mock",
  durationS: 2,
  ...extra,
});

const spoken = (text, from, to) => {
  const chars = [...text];
  const step = (to - from) / chars.length;
  return {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => from + i * step),
    character_end_times_seconds: chars.map((_, i) => from + (i + 1) * step),
  };
};

test("the manifest loops a short bed, mixes a trailer and sets kickers over karaoke", () => {
  const timeline = {
    aspect: "16:9",
    narrationPath: "/tmp/n.mp3",
    narrationAlignment: spoken("שלום לכולם ותודה", 0, 3),
    musicPath: "/tmp/m.wav",
    musicDurationS: 2,
    musicBodyS: 1.8,
    soundDesign: true,
    voiceLufs: -19,
    brand: { ctaText: "הירשמו עכשיו" },
    scenes: [
      still("a", {
        overlayText: "אנליסטית",
        voiceoverText: "שלום לכולם",
        narrationText: "שלום לכולם",
      }),
      still("b", {
        overlayText: "ותודה",
        voiceoverText: "ותודה",
        narrationText: "ותודה",
      }),
    ],
  };
  const { manifest } = buildWorkshopManifest(timeline);
  expect(manifest.scenes.map((s) => s.kicker)).toStrictEqual([
    "אנליסטית",
    null,
  ]);
  const loops = manifest.musicLoops;
  expect(loops.length).toBeGreaterThan(1);
  expect(loops[0]).toMatchObject({ startFrame: 0, frameCount: 54 });
  expect(loops.at(-1).startFrame + loops.at(-1).frameCount).toBe(
    manifest.totalFrames,
  );
  const trailer = mixProfile({ trailer: true, voiceLufs: -19 });
  expect(manifest.musicEnvelope.volumes[0]).toBe(trailer.musicDucked);
  expect(manifest.musicEnvelope.volumes.at(-1)).toBe(trailer.music);
  // Without sound design the bed keeps today's levels.
  const plain = buildWorkshopManifest({
    ...timeline,
    soundDesign: false,
  }).manifest;
  expect(plain.musicEnvelope.volumes[0]).toBe(MIX.musicDucked);
  expect(plain.musicEnvelope.volumes.at(-1)).toBe(MIX.music);
  // An unmeasured bed has no loops: the composition loops the track itself.
  const unmeasured = buildWorkshopManifest({
    ...timeline,
    musicDurationS: 0,
  }).manifest;
  expect("musicLoops" in unmeasured).toBe(false);
});

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

test("the ffmpeg bed loops with crossfades, follows the envelope and fades with the film", () => {
  const { filters, loops } = musicBedFilters({
    input: 2,
    musicS: 4,
    bodyS: 3.6,
    filmS: 10,
    volume: 0.18,
    fps: 25,
  });
  expect(loops.length).toBe(4);
  const text = filters.join(";");
  expect(text).toContain(
    "[2:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=4",
  );
  expect(text).toContain(
    "[mloop0]atrim=0:3.6,asetpts=PTS-STARTPTS,afade=t=out:st=2.4:d=1.2:curve=qsin,adelay=0:all=1[mpart0]",
  );
  expect(text).toContain("afade=t=in:d=1.2:curve=qsin");
  expect(text).toContain("adelay=2400:all=1[mpart1]");
  expect(text).toContain(
    "amix=inputs=4:duration=longest:dropout_transition=0:normalize=0[mbed]",
  );
  expect(filters.at(-1)).toBe(
    "[mbed]apad=whole_dur=10,atrim=0:10,asetpts=N/SR/TB,volume=0.18,afade=t=out:st=8.5:d=1.5[m]",
  );
  // A long enough track is one copy.
  const one = musicBedFilters({
    input: 1,
    musicS: 30,
    filmS: 10,
    volume: "0.5",
    fps: 25,
  });
  expect(one.loops.length).toBe(1);
  expect(one.filters[0]).toBe(
    "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[mbed]",
  );
  expect(one.filters[1]).toContain("volume='0.5':eval=frame");
});

test("the envelope becomes a piecewise volume expression of t", () => {
  const expr = envelopeExpression(
    { frames: [0, 25, 50, 100], volumes: [0.6, 0.6, 0.2, 0.2] },
    25,
  );
  expect(expr).toBe(
    "gte(t,0)*lt(t,1)*0.6+gte(t,1)*lt(t,2)*(0.6+-0.4*(t-1)/1)+gte(t,2)*lt(t,4)*0.2+gte(t,4)*0.2",
  );
  const at = (t) =>
    Function(
      "t",
      "gte",
      "lt",
      `return ${expr};`,
    )(
      t,
      (a, b) => (a >= b ? 1 : 0),
      (a, b) => (a < b ? 1 : 0),
    );
  expect(at(0.5)).toBeCloseTo(0.6);
  expect(at(1.5)).toBeCloseTo(0.4);
  expect(at(3)).toBeCloseTo(0.2);
  expect(at(9)).toBeCloseTo(0.2);
});
