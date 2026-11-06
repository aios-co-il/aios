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
  roundUsd,
  voiceEstimate,
} from "./cost-scene.ts";
import { VOICE_USD_PER_1000_CHARS, voiceCharacters } from "./clip-prices.ts";
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
  "a line is quoted at its length without nikud: ElevenLabs does not bill the points",
  () => {
    // Staging, 5 Nov: this 96-character script was sent with nikud and billed 66 characters.
    const line =
      "קמפיין הוא מהלך אחד. ולעסק יש חמישה. קופי, מדיה, מכירות. ודאטה, שמחברת הכול. כרמן מנהלת את הכול.";
    assertStrictEquals(voiceCharacters(line), 96);
    // A pointed line costs what its plain letters cost; maqaf is punctuation and counts.
    assertStrictEquals(
      voiceCharacters("הַקָּפֶה שֶׁלָּנוּ"),
      "הקפה שלנו".length,
    );
    assertStrictEquals(voiceCharacters("א־ב־ג־ד"), 7);
    assertStrictEquals(voiceCharacters(" Fresh coffee "), 12);
    assertStrictEquals(
      voiceEstimate([{ duration_s: 5, voiceover_text: line }]).usd,
      roundUsd((96 / 1000) * VOICE_USD_PER_1000_CHARS),
    );
  },
);

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
