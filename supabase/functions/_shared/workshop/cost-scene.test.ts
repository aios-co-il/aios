import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  musicEstimate as appMusic,
  sceneEstimate as appScenes,
  voiceEstimate as appVoice,
} from "../../../../src/components/marketing/departments/creative/videoEngines.ts";
import {
  clipEstimate,
  costSceneOf,
  musicEstimate,
  voiceEstimate,
} from "./cost-scene.ts";
import { type SceneEngine } from "./scene-engine.ts";

const scenes = [
  { duration_s: 3, voiceover_text: "כרמן יושבת ליד המחשב" },
  { duration_s: 7, voiceover_text: "ובונה את הקמפיין הבא" },
  { duration_s: 12, voiceover_text: "" },
];

// The app's estimator works on storyboard frames; only these fields matter to it.
const frames = scenes.map((scene, index) => ({
  id: String(index),
  order: index,
  duration: scene.duration_s,
  voiceover: scene.voiceover_text,
  voiceAssetId: undefined,
  voiceText: undefined,
})) as never;

Deno.test("clip prices match the app for every engine", () => {
  for (const engine of [
    "mock",
    "kling",
    "elevenlabs",
    "higgsfield",
    "openrouter",
  ] as SceneEngine[]) {
    const mine = clipEstimate(engine, scenes);
    const app = appScenes(engine, frames);
    assertStrictEquals(mine.usd, app.usd, engine);
    assertStrictEquals(mine.seconds, app.seconds, engine);
    assertStrictEquals(mine.credits, app.credits, engine);
  }
});

Deno.test("voice and music prices match the app", () => {
  assertStrictEquals(voiceEstimate(scenes).usd, appVoice(frames).usd);
  assertStrictEquals(musicEstimate(scenes).usd, appMusic(frames).usd);
});

Deno.test(
  "an OpenRouter clip shorter than 5 s is quoted at the 5 s it is billed for",
  () => {
    const short = clipEstimate("openrouter", [
      { duration_s: 3, voiceover_text: "" },
    ]);
    assertStrictEquals(short.usd, 0.42);
    assertStrictEquals(short.seconds, 3);
  },
);

Deno.test("a scene row is priced from its talking meta", () => {
  assertEquals(
    costSceneOf({
      duration_s: "4",
      voiceover_text: "שלום",
      meta: { lipsync: true, dialogue: "היי", chosen_voice: true },
    }),
    {
      duration_s: 4,
      voiceover_text: "שלום",
      lipsync: true,
      dialogue: "היי",
      chosen_voice: true,
    },
  );
  // chosen_voice counts only on a talking scene.
  assertEquals(
    costSceneOf({ meta: { chosen_voice: true } }).chosen_voice,
    false,
  );
});
