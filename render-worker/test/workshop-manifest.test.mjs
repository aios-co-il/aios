import { expect, test } from "vitest";
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
  expect(manifest.schemaVersion).toBe(3);
  expect(manifest.composition).toBe("WorkshopFilm");
  expect([manifest.width, manifest.height]).toStrictEqual([1080, 1080]);
  expect(manifest.scenes[0].still).toBe("still-0.png");
  expect(manifest.scenes[0].clip).toBe(null);
  expect(manifest.scenes[0].frameCount).toBe(90);
  expect(manifest.scenes[0].move).toBe("push");
  expect(manifest.scenes[0].caption).toBe("שלום");
  expect(manifest.scenes[1].clip).toBe("clip-1.mp4");
  expect(manifest.scenes[1].still).toBe(null);
  expect(manifest.scenes[1].startFrame).toBe(90);
  expect(manifest.scenes[1].frameCount).toBe(120);
  expect(manifest.scenes[1].move).toBe("drift-left");
  expect(manifest.totalFrames).toBe(210);
  expect(manifest.narration).toBe("narration.mp3");
  expect(manifest.music).toBe("music.mp3");
  expect(files.map((file) => file.to)).toStrictEqual([
    "still-0.png",
    "clip-1.mp4",
    "narration.mp3",
    "music.mp3",
  ]);
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
  expect(manifest.scenes.map((s) => s.transition)).toStrictEqual([
    "cut",
    "crossfade",
    "slide",
    "zoom",
    "wipe",
    "crossfade",
  ]);
  expect(manifest.scenes[0].transitionFrames).toBe(0);
  expect(manifest.scenes[1].transitionFrames).toBe(15);
  expect(manifest.scenes[5].transitionFrames).toBe(5);
  expect(manifest.totalFrames).toBe(5 * 60 + 15);
  expect(manifest.captions.length).toBe(0);
  expect(manifest.brand).toBe(null);
  expect(manifest.endCard).toBe(null);
});

test("scenes stretch so a longer narration is never cut", () => {
  const { manifest } = buildWorkshopManifest({
    aspect: "1:1",
    narrationPath: "/tmp/n.mp3",
    narrationDurationS: 9,
    scenes: [scene("a", { durationS: 2 }), scene("b", { durationS: 4 })],
  });
  // 9 s of speech plus a 15-frame tail, split 1:2 like the storyboard.
  expect(manifest.totalFrames).toBe(285);
  expect(manifest.scenes.map((s) => s.frameCount)).toStrictEqual([95, 190]);
  expect(manifest.scenes[1].startFrame).toBe(95);
  // No word timings: the bed ducks for the whole narration.
  expect(manifest.musicEnvelope.volumes[0]).toBe(0.06);
  const short = buildWorkshopManifest({
    narrationPath: "/tmp/n.mp3",
    narrationDurationS: 1,
    scenes: [scene("a", { durationS: 3 })],
  }).manifest;
  expect(short.totalFrames).toBe(90);
});

test("word timings become karaoke captions and duck the music", () => {
  const { manifest } = buildWorkshopManifest({
    narrationPath: "/tmp/n.mp3",
    narrationAlignment: alignment,
    musicPath: "/tmp/m.mp3",
    scenes: [scene("a", { durationS: 3 })],
  });
  expect(manifest.captions.length).toBe(1);
  expect(
    manifest.captions[0].words.map((w) => [w.text, w.startFrame, w.endFrame]),
  ).toStrictEqual([
    ["שלום", 0, 12],
    ["עולם", 15, 30],
  ]);
  expect(manifest.musicEnvelope).toStrictEqual({
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
  expect(a.voice).toBe("voice-0.mp3");
  expect(a.clipVolume).toBe(0.15);
  expect(b.clipVolume).toBe(0.9);
  expect(c.clipVolume).toBe(0);
  expect(d.clip).toBe("clip-3.mp4");
  expect(d.move).toBe("static");
  expect(d.clipVolume).toBe(1);
  expect(d.frameCount).toBe(150);
  const muted = buildWorkshopManifest({
    clipAudio: false,
    scenes: [scene("b", real)],
  }).manifest;
  expect(muted.clipAudio).toBe(false);
  expect(muted.scenes[0].clipVolume).toBe(0);
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
  expect(manifest.brand).toStrictEqual({
    primaryColor: "#FF3366",
    secondaryColor: null,
    logo: "logo.png",
    fontFamily: "Assistant",
    ctaText: "הזמינו עכשיו",
    ctaUrl: "example.co.il",
  });
  expect(manifest.endCard).toStrictEqual({ startFrame: 60, frameCount: 75 });
  expect(manifest.totalFrames).toBe(135);
  expect(files.some((f) => f.to === "logo.png")).toBeTruthy();
  const colorsOnly = buildWorkshopManifest({
    scenes: [scene("a")],
    brand: { primaryColor: "#123456" },
  }).manifest;
  expect(colorsOnly.endCard).toBe(null);
  expect(colorsOnly.totalFrames).toBe(60);
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
  expect(words.map((w) => w.text)).toStrictEqual([
    "מחכה",
    "לכם",
    "לקפה",
    "של",
    "בוקר",
  ]);
  expect(words[0].startFrame > 0).toBeTruthy();
  const last = words[words.length - 1];
  expect(last.endFrame <= manifest.scenes[0].frameCount).toBeTruthy();
  for (let i = 1; i < words.length; i++)
    expect(words[i].startFrame >= words[i - 1].endFrame).toBeTruthy();
});

test("a talking clip shorter than its scene is captioned only while it speaks", () => {
  const { manifest } = buildWorkshopManifest({
    scenes: [
      scene("t", {
        clipProvider: "openrouter",
        stillPath: null,
        lipsync: true,
        clipDurationS: 4,
        durationS: 8,
        spokenText: "בואו לבקר אותנו",
      }),
    ],
  });
  const words = manifest.captions.flatMap((chunk) => chunk.words);
  expect(words.at(-1).endFrame <= 4 * manifest.fps).toBeTruthy();
});

test("an ending without a closing card leaves the end card out", () => {
  const { manifest } = buildWorkshopManifest({
    scenes: [scene("a")],
    brand: { logoPath: "/tmp/logo.png", ctaText: "בואו", endCard: false },
  });
  expect(manifest.endCard).toBe(null);
});
