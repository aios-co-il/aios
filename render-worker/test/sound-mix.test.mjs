import { expect, test } from "vitest";
import { effectsGraph, fallbackEffectCues } from "../src/compose/assemble.mjs";
import { effectsVolume } from "../src/compose/ffmpeg-bed.mjs";
import { mixProfile } from "../src/compose/music-bed.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { cutSoundOrder } from "../src/compose/transition-sounds.mjs";
import { effectCues } from "../src/compose/workshop-edit.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

const ITEM = "22222222-2222-2222-2222-222222222222";

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
  // Each cut can play its own sound, for that sound's length, its swell still at the cut.
  const own = effectCues(scenes, {
    fps: 30,
    totalFrames: 345,
    cutSounds: [
      { file: "sfx-cut-2.mp3", frames: 18 },
      { file: "sfx-cut-0.mp3", frames: 30 },
    ],
  });
  expect(own).toStrictEqual([
    { file: "sfx-cut-2.mp3", startFrame: 75, frameCount: 18 },
    { file: "sfx-cut-0.mp3", startFrame: 168, frameCount: 30 },
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

test("the Remotion edit plays a different transition sound at each cut and ducks them under the voice", () => {
  const transitionPaths = ["/tmp/t0.mp3", "/tmp/t1.mp3", "/tmp/t2.mp3"];
  const timeline = {
    aspect: "9:16",
    brand: { ctaText: "הירשמו", endCard: true },
    effects: {
      transitionPaths,
      transitionDurationsS: [1, 0.6, 1.2],
      impactPath: "/tmp/i.mp3",
      impactDurationS: 2,
      seed: ITEM,
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
      ...["b", "c", "d", "e"].map((id) => still(id)),
    ],
  };
  const { manifest, files } = buildWorkshopManifest(timeline);
  const order = cutSoundOrder(3, 4, ITEM);
  const cuts = manifest.effects.filter((cue) => cue.file !== "sfx-impact.mp3");
  expect(cuts.map((cue) => cue.file)).toStrictEqual(
    order.map((index) => `sfx-cut-${index}.mp3`),
  );
  // Each cue lasts its own sound.
  for (const cue of cuts)
    expect(cue.frameCount).toBe(
      [30, 18, 36][Number(/cut-(\d)/.exec(cue.file)[1])],
    );
  for (let i = 1; i < cuts.length; i++)
    expect(cuts[i].file).not.toBe(cuts[i - 1].file);
  expect(new Set(cuts.slice(0, 3).map((cue) => cue.file)).size).toBe(3);
  // Only the sounds the film plays are staged; the same film renders the same sounds again.
  const staged = files.map((f) => f.to).filter((to) => to.startsWith("sfx-"));
  expect(new Set(staged)).toStrictEqual(
    new Set(manifest.effects.map((cue) => cue.file)),
  );
  expect(buildWorkshopManifest(timeline).manifest.effects).toStrictEqual(
    manifest.effects,
  );
  const impacts = manifest.effects.filter(
    (cue) => cue.file === "sfx-impact.mp3",
  );
  expect(impacts.map((cue) => cue.startFrame)).toStrictEqual([
    0,
    manifest.endCard.startFrame - 6,
  ]);
  const level = (frame) => {
    const { frames, volumes } = manifest.effectsEnvelope;
    let at = 0;
    while (at < frames.length - 1 && frames[at + 1] <= frame) at += 1;
    return volumes[at];
  };
  // Under the opening line the effects dip; between lines they come back up.
  const mix = mixProfile({ trailer: true });
  expect(level(20)).toBe(mix.effectsDucked);
  expect(level(manifest.endCard.startFrame)).toBe(mix.effects);
  expect(mix.effectsDucked).toBeLessThan(mix.effects);
  // A film from before the set (one whoosh) plays it at every cut.
  const legacy = buildTimeline(
    timeline.scenes.map((scene, position) => ({ ...scene, position })),
    { effects: { whooshPath: "/tmp/w.mp3" } },
  );
  expect(legacy.effects).toStrictEqual({
    transitionPaths: ["/tmp/w.mp3"],
    impactPath: null,
    seed: "",
  });
  expect(
    buildWorkshopManifest(legacy).manifest.effects.map((cue) => cue.file),
  ).toStrictEqual(Array(4).fill("sfx-cut-0.mp3"));
  // A film without sound design keeps its manifest as it was.
  const plain = buildWorkshopManifest({ aspect: "9:16", scenes: [still("a")] });
  expect("effects" in plain.manifest).toBe(false);
});

test("the ffmpeg edit lays each cut's own sound as a delayed copy on the effects envelope", () => {
  const cues = fallbackEffectCues([3, 2.5, 4], {
    impact: true,
    endCardS: 9.5,
    cutSounds: ["cut1", "cut0"],
  });
  expect(cues).toStrictEqual([
    { name: "impact", atS: 0 },
    { name: "cut1", atS: 2.6 },
    { name: "cut0", atS: 5.1 },
    { name: "impact", atS: 9.3 },
  ]);
  // Without its own sounds every cut plays the whoosh, as before.
  expect(
    fallbackEffectCues([3, 2.5], { whoosh: true }).map((cue) => cue.name),
  ).toStrictEqual(["whoosh"]);
  const volume = effectsVolume({ voiceLufs: -19 }, [[0.5, 2.4]], 9.5, 25);
  const graph = effectsGraph(cues, { impact: 3, cut0: 4, cut1: 5 }, { volume });
  const text = graph.filters.join(";");
  expect(text).toContain(
    "[3:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[impact_0][impact_1]",
  );
  expect(text).toContain("[cut0_0]adelay=5100:all=1[cut0_d0]");
  expect(text).toContain("[cut1_0]adelay=2600:all=1[cut1_d0]");
  expect(text).toContain("[impact_1]adelay=9300:all=1[impact_d1]");
  expect(text).toContain(
    `amix=inputs=4:duration=longest:dropout_transition=0:normalize=0,asetpts=N/SR/TB,volume='${volume}':eval=frame[fx]`,
  );
  expect(graph).toStrictEqual({ filters: graph.filters, effects: "[fx]" });
  // The ffmpeg envelope carries the trailer mix's effect gains: down under the line, up after.
  const mix = mixProfile({ trailer: true, voiceLufs: -19 });
  expect(volume).toContain(`*${mix.effectsDucked}`);
  expect(volume.endsWith(`*${mix.effects}`)).toBe(true);
});
