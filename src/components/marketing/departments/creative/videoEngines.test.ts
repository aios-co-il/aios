import { expect, test } from "vitest";
import type { StoryboardFrame } from "./types.ts";
import {
  elevenLabsAspect,
  elevenLabsClipSeconds,
  getSceneEngine,
  getSoundEngine,
  musicEstimate,
  sceneClipSeconds,
  sceneEstimate,
  soundRunsSeparately,
  framesToVoice,
  voiceEstimate,
} from "./videoEngines.ts";

const frame = (overrides: Partial<StoryboardFrame> = {}): StoryboardFrame => ({
  id: "a",
  order: 1,
  title: "סצנה",
  shot: "Medium shot",
  visualPrompt: "",
  overlayText: "",
  voiceover: "",
  duration: 3,
  x: 0,
  y: 100,
  ...overrides,
});

test("an unset scene engine stays on the free preview", () => {
  expect(getSceneEngine(null)).toBe("mock");
  expect(getSceneEngine({ video: { scene_engine: "nope" } })).toBe("mock");
  expect(getSceneEngine({ video: { scene_engine: "higgsfield" } })).toBe(
    "higgsfield",
  );
  expect(getSoundEngine({})).toBe("elevenlabs");
});

test("each engine bills the clip length its API actually renders", () => {
  expect(elevenLabsClipSeconds(3)).toBe(4);
  expect(elevenLabsClipSeconds(5)).toBe(6);
  expect(elevenLabsClipSeconds(8)).toBe(8);
  expect(sceneClipSeconds("kling", 3)).toBe(5);
  expect(sceneClipSeconds("kling", 8)).toBe(10);
  expect(sceneClipSeconds("higgsfield", 3.2)).toBe(4);
  expect(sceneClipSeconds("higgsfield", 40)).toBe(15);
  expect(sceneClipSeconds("openrouter", 2)).toBe(3);
  expect(sceneClipSeconds("openrouter", 7.5)).toBe(8);
  expect(elevenLabsAspect("16:9")).toBe("16:9");
  expect(elevenLabsAspect("1:1")).toBe("9:16");
});

test("the free preview estimates zero and paid engines follow their rate", () => {
  const frames = [frame({ duration: 3 }), frame({ duration: 8 })];
  expect(sceneEstimate("mock", frames).usd).toBe(0);
  expect(sceneEstimate("kling", frames)).toStrictEqual({
    count: 2,
    seconds: 15,
    usd: 2.55,
    credits: 15300,
    label: "Kling",
  });
  expect(sceneEstimate("elevenlabs", frames).seconds).toBe(12);
  expect(sceneEstimate("elevenlabs", frames).usd).toBe(1.8);
  expect(sceneEstimate("higgsfield", frames).seconds).toBe(11);
  expect(sceneEstimate("higgsfield", frames).usd).toBe(1.1);
});

test("voice bills the spoken characters and music bills the storyboard length", () => {
  const frames = [
    frame({ voiceover: "א".repeat(1000), duration: 4 }),
    frame({ voiceover: "   ", duration: 6 }),
  ];
  expect(voiceEstimate(frames).count).toBe(1);
  expect(
    framesToVoice([
      frame({
        id: "a",
        voiceover: "אחת",
        voiceAssetId: "v",
        voiceText: "אחת",
      }),
      frame({
        id: "b",
        voiceover: "שתיים",
        voiceAssetId: "v",
        voiceText: "ישנה",
      }),
    ]).map((item) => item.id),
  ).toStrictEqual(["a", "b"]);
  expect(voiceEstimate(frames).usd).toBe(0.12);
  expect(musicEstimate(frames).seconds).toBe(10);
  // Priced for the film the bed covers: 10 s with 15% headroom, the end card and the tail.
  expect(musicEstimate(frames).usd).toBe(0.17);
  // The showcase: 12 scenes of 3.5 s, quoted for 56.8 s ($0.47), asked for 56.2 s.
  expect(
    musicEstimate(Array.from({ length: 12 }, () => frame({ duration: 3.5 })))
      .usd,
  ).toBe(0.47);
  expect(musicEstimate([]).usd).toBe(0);
  expect(soundRunsSeparately("elevenlabs")).toBe(true);
  expect(soundRunsSeparately("higgsfield", "higgsfield")).toBe(false);
  // Higgsfield sound only exists inside Higgsfield clips: other engines still need voice.
  expect(soundRunsSeparately("higgsfield", "kling")).toBe(true);
});
