import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assembleFilm } from "../src/compose/assemble.mjs";
import {
  envelopeExpression,
  musicBedFilters,
} from "../src/compose/ffmpeg-bed.mjs";
import {
  MAX_MUSIC_LOOPS,
  MUSIC_CROSSFADE,
  MUSIC_END_FADE,
  MUSIC_LUFS,
  TRAILER,
  isTrailer,
  mixProfile,
  musicLoops,
} from "../src/compose/music-bed.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { MIX, musicEnvelope } from "../src/compose/workshop-edit.mjs";
import { db, hasFfmpeg, media, meanDb } from "./media.mjs";

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
  // 1.5 s hand-overs and the film's 1.5 s closing fade, at 30 fps.
  expect([MUSIC_CROSSFADE, MUSIC_END_FADE]).toStrictEqual([45, 45]);
  // A long film takes as many copies as it needs, up to what render-job.mjs accepts.
  expect(musicLoops(10, 100_000).length).toBe(MAX_MUSIC_LOOPS);
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
  // The bed's envelope options travel with the profile, for both edits.
  expect(mixProfile().bed).toStrictEqual({
    base: MIX.music,
    ducked: MIX.musicDucked,
    attack: 8,
    release: 14,
    hold: 0,
  });
  expect(trailer.bed).toStrictEqual({
    base: trailer.music,
    ducked: trailer.musicDucked,
    attack: TRAILER.attack,
    release: TRAILER.release,
    hold: TRAILER.hold,
  });
  // The brief's sound design, or the film's effects, make it a trailer.
  expect(isTrailer({ soundDesign: true })).toBe(true);
  expect(isTrailer({ effects: { whooshPath: "/w.wav" } })).toBe(true);
  expect(isTrailer({ soundDesign: false, effects: null })).toBe(false);
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
