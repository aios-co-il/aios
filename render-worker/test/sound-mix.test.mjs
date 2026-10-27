import { expect, test } from "vitest";
import { effectsGraph, fallbackEffectCues } from "../src/compose/assemble.mjs";
import { MIX, effectCues } from "../src/compose/workshop-edit.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

test("cues: an impact on the title and the end card, a whoosh into every cut", () => {
  const scenes = [
    { startFrame: 0, transitionFrames: 0 },
    { startFrame: 90, transitionFrames: 12 },
    { startFrame: 180, transitionFrames: 0 },
  ];
  const cues = effectCues(scenes, {
    fps: 30,
    totalFrames: 345,
    whoosh: "sfx-whoosh.mp3",
    impact: "sfx-impact.mp3",
    whooshFrames: 36,
    impactFrames: 75,
    endCardStart: 270,
  });
  expect(cues).toStrictEqual([
    { file: "sfx-impact.mp3", startFrame: 0, frameCount: 75 },
    { file: "sfx-whoosh.mp3", startFrame: 72, frameCount: 36 },
    { file: "sfx-whoosh.mp3", startFrame: 168, frameCount: 36 },
    { file: "sfx-impact.mp3", startFrame: 264, frameCount: 75 },
  ]);
  // Nothing runs past the film.
  const short = effectCues(scenes.slice(0, 1), {
    fps: 30,
    totalFrames: 40,
    impact: "i.mp3",
    impactFrames: 75,
  });
  expect(short).toStrictEqual([
    { file: "i.mp3", startFrame: 0, frameCount: 40 },
  ]);
});

const still = (id, extra = {}) => ({
  id,
  clipPath: `/tmp/${id}.mp4`,
  stillPath: `/tmp/${id}.png`,
  clipProvider: "mock",
  overlayText: id,
  durationS: 3,
  ...extra,
});

test("the Remotion edit stages the effects and ducks them under the voice", () => {
  const { manifest, files } = buildWorkshopManifest({
    aspect: "9:16",
    brand: { ctaText: "הירשמו", endCard: true },
    effects: {
      whooshPath: "/tmp/w.mp3",
      impactPath: "/tmp/i.mp3",
      whooshDurationS: 1.2,
      impactDurationS: 2.5,
    },
    scenes: [
      still("a", {
        voicePath: "/tmp/va.mp3",
        voiceAlignment: {
          characters: [..."שלום"],
          character_start_times_seconds: [0.1, 0.2, 0.3, 0.4],
          character_end_times_seconds: [0.2, 0.3, 0.4, 1.5],
        },
      }),
      still("b"),
    ],
  });
  expect(files.map((f) => f.to)).toContain("sfx-whoosh.mp3");
  expect(files.map((f) => f.to)).toContain("sfx-impact.mp3");
  expect(manifest.effects.map((cue) => cue.file)).toStrictEqual([
    "sfx-impact.mp3",
    "sfx-whoosh.mp3",
    "sfx-impact.mp3",
  ]);
  expect(manifest.effects[2].startFrame).toBe(manifest.endCard.startFrame - 6);
  const level = (frame) => {
    const { frames, volumes } = manifest.effectsEnvelope;
    let at = 0;
    while (at < frames.length - 1 && frames[at + 1] <= frame) at += 1;
    return volumes[at];
  };
  // Under the opening line the effects dip; between lines they come back up.
  expect(level(20)).toBe(MIX.effectsDucked);
  expect(level(manifest.endCard.startFrame)).toBe(MIX.effects);
  expect(MIX.effectsDucked).toBeLessThan(MIX.effects);
  // A film without sound design keeps its manifest as it was.
  const plain = buildWorkshopManifest({ aspect: "9:16", scenes: [still("a")] });
  expect("effects" in plain.manifest).toBe(false);
});

test("the ffmpeg edit lays each cue as a delayed copy ducked under the speech", () => {
  const cues = fallbackEffectCues([3, 2.5, 4], {
    whoosh: true,
    impact: true,
    endCardS: 9.5,
  });
  expect(cues).toStrictEqual([
    { name: "impact", atS: 0 },
    { name: "whoosh", atS: 2.6 },
    { name: "whoosh", atS: 5.1 },
    { name: "impact", atS: 9.3 },
  ]);
  const graph = effectsGraph(
    cues,
    { whoosh: 3, impact: 4 },
    { narration: true },
  );
  const text = graph.filters.join(";");
  expect(text).toContain("[a0][n]amix=inputs=2");
  expect(text).toContain(
    `[3:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${MIX.effects},asplit=2[whoosh0][whoosh1]`,
  );
  expect(text).toContain("[whoosh1]adelay=5100:all=1[whooshd1]");
  expect(text).toContain("[impact1]adelay=9300:all=1[impactd1]");
  expect(text).toContain("amix=inputs=4:duration=longest");
  expect(text).toContain("[fxraw][key]sidechaincompress");
  expect(graph).toMatchObject({ speech: "[speech]", effects: "[fx]" });
});
