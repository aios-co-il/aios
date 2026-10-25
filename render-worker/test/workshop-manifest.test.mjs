import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";

test("a mock clip is edited from its still and a real clip stays video", () => {
  const { manifest, files } = buildWorkshopManifest({
    aspect: "1:1",
    narrationPath: "/tmp/narration.mp3",
    musicPath: "/tmp/music.mp3",
    scenes: [
      {
        id: "a",
        clipPath: "/tmp/a.mp4",
        stillPath: "/tmp/a.png",
        clipProvider: "mock",
        overlayText: "שלום",
        durationS: 3,
      },
      {
        id: "b",
        clipPath: "/tmp/b.mp4",
        stillPath: "/tmp/b.jpg",
        clipProvider: "higgsfield",
        overlayText: "עולם",
        durationS: 4,
      },
    ],
  });
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.composition, "WorkshopFilm");
  assert.deepEqual([manifest.width, manifest.height], [1080, 1080]);
  assert.equal(manifest.scenes[0].still, "still-0.png");
  assert.equal(manifest.scenes[0].clip, null);
  assert.equal(manifest.scenes[0].frameCount, 90);
  assert.equal(manifest.scenes[0].move, "push");
  assert.equal(manifest.scenes[0].caption, "שלום");
  assert.equal(manifest.scenes[1].clip, "clip-1.mp4");
  assert.equal(manifest.scenes[1].still, null);
  assert.equal(manifest.scenes[1].startFrame, 90);
  assert.equal(manifest.scenes[1].frameCount, 120);
  assert.equal(manifest.scenes[1].move, "drift-left");
  assert.equal(manifest.totalFrames, 210);
  assert.equal(manifest.narration, "narration.mp3");
  assert.equal(manifest.music, "music.mp3");
  assert.deepEqual(
    files.map((file) => file.to),
    ["still-0.png", "clip-1.mp4", "narration.mp3", "music.mp3"],
  );
});

const scene = (id, extra = {}) => ({
  id,
  clipPath: `/tmp/${id}.mp4`,
  stillPath: `/tmp/${id}.png`,
  clipProvider: "mock",
  overlayText: id,
  durationS: 2,
  ...extra,
});

// "שלום עולם" spoken over 0–1 s: the ElevenLabs /with-timestamps character alignment.
const alignment = {
  characters: [..."שלום עולם"],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1],
};

test("transitions vary by default, overlap at most a third, and honour the manifest", () => {
  const { manifest } = buildWorkshopManifest({
    aspect: "9:16",
    scenes: [
      scene("a"),
      scene("b"),
      scene("c"),
      scene("d"),
      scene("e", { transition: "wipe" }),
      scene("f", { durationS: 0.5 }),
    ],
  });
  assert.deepEqual(
    manifest.scenes.map((s) => s.transition),
    ["cut", "crossfade", "slide", "zoom", "wipe", "crossfade"],
  );
  assert.equal(manifest.scenes[0].transitionFrames, 0);
  assert.equal(manifest.scenes[1].transitionFrames, 15);
  assert.equal(manifest.scenes[5].transitionFrames, 5);
  assert.equal(manifest.totalFrames, 5 * 60 + 15);
  assert.equal(manifest.captions.length, 0);
  assert.equal(manifest.brand, null);
  assert.equal(manifest.endCard, null);
});

test("scenes stretch so a longer narration is never cut", () => {
  const { manifest } = buildWorkshopManifest({
    aspect: "1:1",
    narrationPath: "/tmp/n.mp3",
    narrationDurationS: 9,
    scenes: [scene("a", { durationS: 2 }), scene("b", { durationS: 4 })],
  });
  // 9 s of speech plus a 15-frame tail, split 1:2 like the storyboard.
  assert.equal(manifest.totalFrames, 285);
  assert.deepEqual(
    manifest.scenes.map((s) => s.frameCount),
    [95, 190],
  );
  assert.equal(manifest.scenes[1].startFrame, 95);
  // No word timings: the bed ducks for the whole narration.
  assert.equal(manifest.musicEnvelope.volumes[0], 0.06);
  const short = buildWorkshopManifest({
    narrationPath: "/tmp/n.mp3",
    narrationDurationS: 1,
    scenes: [scene("a", { durationS: 3 })],
  }).manifest;
  assert.equal(short.totalFrames, 90);
});

test("word timings become karaoke captions and duck the music", () => {
  const { manifest } = buildWorkshopManifest({
    narrationPath: "/tmp/n.mp3",
    narrationAlignment: alignment,
    musicPath: "/tmp/m.mp3",
    scenes: [scene("a", { durationS: 3 })],
  });
  assert.equal(manifest.captions.length, 1);
  assert.deepEqual(
    manifest.captions[0].words.map((w) => [w.text, w.startFrame, w.endFrame]),
    [
      ["שלום", 0, 12],
      ["עולם", 15, 30],
    ],
  );
  assert.deepEqual(manifest.musicEnvelope, {
    frames: [0, 30, 44, 90],
    volumes: [0.06, 0.06, 0.2, 0.2],
  });
});

test("clip audio plays alone, sits under speech, and a lip-synced clip stays loud and still", () => {
  const real = { clipProvider: "kling", stillPath: null };
  const { manifest } = buildWorkshopManifest({
    scenes: [
      scene("a", { ...real, voicePath: "/tmp/v.mp3", voiceDurationS: 1 }),
      scene("b", real),
      scene("c", { ...real, clipHasAudio: false }),
      scene("d", { clipProvider: "mock", lipsync: true, clipDurationS: 5 }),
    ],
  });
  const [a, b, c, d] = manifest.scenes;
  assert.equal(a.voice, "voice-0.mp3");
  assert.equal(a.clipVolume, 0.15);
  assert.equal(b.clipVolume, 0.9);
  assert.equal(c.clipVolume, 0);
  assert.equal(d.clip, "clip-3.mp4");
  assert.equal(d.move, "static");
  assert.equal(d.clipVolume, 1);
  assert.equal(d.frameCount, 150);
  const muted = buildWorkshopManifest({
    clipAudio: false,
    scenes: [scene("b", real)],
  }).manifest;
  assert.equal(muted.clipAudio, false);
  assert.equal(muted.scenes[0].clipVolume, 0);
});

test("a brand with a logo or CTA adds an end card and stages the logo", () => {
  const { manifest, files } = buildWorkshopManifest({
    scenes: [scene("a")],
    brand: {
      primaryColor: "#FF3366",
      secondaryColor: "red",
      logoPath: "/tmp/logo.png",
      fontFamily: "Assistant",
      ctaText: "הזמינו עכשיו",
      ctaUrl: "example.co.il",
    },
  });
  assert.deepEqual(manifest.brand, {
    primaryColor: "#FF3366",
    secondaryColor: null,
    logo: "logo.png",
    fontFamily: "Assistant",
    ctaText: "הזמינו עכשיו",
    ctaUrl: "example.co.il",
  });
  assert.deepEqual(manifest.endCard, { startFrame: 60, frameCount: 75 });
  assert.equal(manifest.totalFrames, 135);
  assert.ok(files.some((f) => f.to === "logo.png"));
  const colorsOnly = buildWorkshopManifest({
    scenes: [scene("a")],
    brand: { primaryColor: "#123456" },
  }).manifest;
  assert.equal(colorsOnly.endCard, null);
  assert.equal(colorsOnly.totalFrames, 60);
});

test("a talking clip's line is captioned across its speech", () => {
  const { manifest } = buildWorkshopManifest({
    scenes: [
      scene("t", {
        clipProvider: "openrouter",
        stillPath: null,
        lipsync: true,
        clipDurationS: 4,
        spokenText: "מחכה לכם לקפה של בוקר",
      }),
    ],
  });
  const words = manifest.captions.flatMap((chunk) => chunk.words);
  assert.deepEqual(
    words.map((w) => w.text),
    ["מחכה", "לכם", "לקפה", "של", "בוקר"],
  );
  assert.ok(words[0].startFrame > 0);
  const last = words[words.length - 1];
  assert.ok(last.endFrame <= manifest.scenes[0].frameCount);
  for (let i = 1; i < words.length; i++)
    assert.ok(words[i].startFrame >= words[i - 1].endFrame);
});
