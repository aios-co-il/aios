import assert from "node:assert/strict";
import { test } from "node:test";
import {
  musicEstimate as appMusic,
  sceneEstimate as appScenes,
  voiceEstimate as appVoice,
} from "../../../../src/components/marketing/departments/creative/videoEngines.ts";
import {
  clipEstimate,
  engineFromKeys,
  musicEstimate,
  productionEstimate,
  voiceEstimate,
  type SceneEngine,
} from "./video-cost.ts";

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

test("clip prices match the app for every engine", () => {
  for (const engine of ["mock", "kling", "elevenlabs", "higgsfield"] as SceneEngine[]) {
    const mine = clipEstimate(engine, scenes);
    const app = appScenes(engine, frames);
    assert.equal(mine.usd, app.usd, engine);
    assert.equal(mine.seconds, app.seconds, engine);
    assert.equal(mine.credits, app.credits, engine);
  }
});

test("voice and music prices match the app", () => {
  assert.equal(voiceEstimate(scenes).usd, appVoice(frames).usd);
  assert.equal(musicEstimate(scenes).usd, appMusic(frames).usd);
});

test("a production adds clips, the spoken scenes and the music bed", () => {
  const full = productionEstimate("elevenlabs", scenes, { withVoice: true, withMusic: true });
  assert.equal(full.clips.usd, 3);
  assert.ok(full.totalUsd > full.clips.usd);
  const silent = productionEstimate("mock", scenes, { withVoice: false, withMusic: false });
  assert.equal(silent.totalUsd, 0);
});

test("the engine follows the keys the tenant has", () => {
  assert.equal(engineFromKeys({ elevenlabs_api_key: "xi-1" }), "elevenlabs");
  assert.equal(
    engineFromKeys({ higgsfield_api_key_id: "a", higgsfield_api_key_secret: "b" }),
    "higgsfield",
  );
  assert.equal(engineFromKeys({ higgsfield_api_key_id: "a" }), "mock");
  assert.equal(engineFromKeys({}), "mock");
});
