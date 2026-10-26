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
  lipsyncEstimate,
  musicEstimate,
  productionEstimate,
  quotedProductionEstimate,
  sceneEngineFor,
  speaksNatively,
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
  for (const engine of [
    "mock",
    "kling",
    "elevenlabs",
    "higgsfield",
    "openrouter",
  ] as SceneEngine[]) {
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
  const full = productionEstimate("elevenlabs", scenes, {
    withVoice: true,
    withMusic: true,
  });
  assert.equal(full.clips.usd, 3);
  assert.ok(full.totalUsd > full.clips.usd);
  const silent = productionEstimate("mock", scenes, {
    withVoice: false,
    withMusic: false,
  });
  assert.equal(silent.totalUsd, 0);
});

test("a talking scene adds a lip-sync pass on a silent engine and nothing on one that speaks", () => {
  const talking = [
    {
      duration_s: 3,
      voiceover_text: "קריינות",
      lipsync: true,
      dialogue: "שלום",
    },
    { duration_s: 4.2, voiceover_text: "כרמן מספרת" },
  ];
  const silent = productionEstimate("kling", talking, {
    withVoice: true,
    withMusic: false,
  });
  // 3 s of lip sync at $0.10 plus its 4-letter line; the talking scene is not narrated.
  assert.equal(silent.lipsync.usd, 0.3);
  assert.equal(silent.talkingScenes, 1);
  assert.equal(silent.voice.usd, voiceEstimate([talking[1]]).usd);
  assert.equal(
    silent.totalUsd,
    Math.round(
      (silent.clips.usd + silent.voice.usd + silent.lipsync.usd) * 100,
    ) / 100,
  );
  assert.deepEqual(lipsyncEstimate("kling", talking).native, false);
  const native = productionEstimate("elevenlabs", talking, {
    withVoice: true,
    withMusic: false,
  });
  assert.equal(native.lipsync.usd, 0);
  assert.equal(lipsyncEstimate("higgsfield", talking).native, true);
  assert.equal(
    productionEstimate("mock", scenes, { withVoice: false, withMusic: false })
      .lipsync.usd,
    0,
  );
  assert.ok(speaksNatively("elevenlabs") && !speaksNatively("mock"));
});

test("the engine follows the keys the tenant has", () => {
  assert.equal(engineFromKeys({ elevenlabs_api_key: "xi-1" }), "elevenlabs");
  assert.equal(
    engineFromKeys({
      higgsfield_api_key_id: "a",
      higgsfield_api_key_secret: "b",
    }),
    "higgsfield",
  );
  assert.equal(engineFromKeys({ higgsfield_api_key_id: "a" }), "mock");
  assert.equal(
    engineFromKeys({ higgsfield_api_key_secret: "id-1:secret-1" }),
    "higgsfield",
  );
  assert.equal(engineFromKeys({}), "mock");
});

test("Starter ElevenLabs video moves to Higgsfield", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ tier: "starter" }), {
      status: 200,
    })) as typeof fetch;
  assert.equal(
    await sceneEngineFor(
      {
        elevenlabs_api_key: "xi",
        higgsfield_api_key_id: "a",
        higgsfield_api_key_secret: "b",
      },
      fetchImpl,
    ),
    "higgsfield",
  );
  assert.equal(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, fetchImpl),
    "mock",
  );
  const pro = (async () =>
    new Response(JSON.stringify({ tier: "pro" }), {
      status: 200,
    })) as typeof fetch;
  assert.equal(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, pro),
    "elevenlabs",
  );
});

test("a connected OpenRouter brain is the video engine before ElevenLabs and Higgsfield", async () => {
  const openrouter = { openrouter: true };
  assert.equal(engineFromKeys({}, openrouter), "openrouter");
  assert.equal(
    engineFromKeys({ elevenlabs_api_key: "xi" }, openrouter),
    "openrouter",
  );
  assert.equal(
    engineFromKeys({ higgsfield_api_key_secret: "a:b" }, openrouter),
    "openrouter",
  );
  assert.equal(engineFromKeys({ elevenlabs_api_key: "xi" }), "elevenlabs");
  assert.equal(
    await sceneEngineFor(
      { higgsfield_api_key_id: "a", higgsfield_api_key_secret: "b" },
      fetch,
      openrouter,
    ),
    "openrouter",
  );
  const starter = (async () =>
    new Response(JSON.stringify({ tier: "starter" }), {
      status: 200,
    })) as typeof fetch;
  assert.equal(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, starter, openrouter),
    "openrouter",
  );
  assert.equal(await sceneEngineFor({}, starter, openrouter), "openrouter");
  assert.equal(await sceneEngineFor({}, starter), "mock");
});

test("OpenRouter quotes Kling 3 lengths and adds the Veo price for talking scenes", () => {
  const clips = clipEstimate("openrouter", scenes);
  assert.equal(clips.seconds, 3 + 7 + 12);
  // The 3 s clip is billed as 5 s: (5 + 7 + 12) × $0.084.
  assert.equal(clips.usd, 2.02);
  assert.ok(speaksNatively("openrouter"));
  const talking = lipsyncEstimate("openrouter", [
    { duration_s: 5, voiceover_text: "", lipsync: true, dialogue: "שלום" },
  ]);
  assert.equal(talking.native, true);
  // Veo 3.1 6 s at $0.40 instead of a 5 s Kling clip at $0.084.
  assert.equal(talking.usd, 1.98);
});

test("a paid engine that can fall back to OpenRouter is quoted at the dearer of the two", () => {
  const film = [
    { duration_s: 5, voiceover_text: "" },
    { duration_s: 5, voiceover_text: "" },
    { duration_s: 8, voiceover_text: "", lipsync: true, dialogue: "שלום" },
  ];
  const options = { withVoice: false, withMusic: true };
  const higgsfield = productionEstimate("higgsfield", film, options);
  const openrouter = productionEstimate("openrouter", film, options);
  assert.ok(openrouter.totalUsd > higgsfield.totalUsd);

  const quoted = quotedProductionEstimate("higgsfield", film, options, {
    openrouter: true,
  });
  assert.equal(quoted.totalUsd, openrouter.totalUsd);
  assert.equal(quoted.pricedOn, "openrouter");
  // Without OpenRouter nothing can take over, and the free preview never falls back.
  assert.equal(
    quotedProductionEstimate("higgsfield", film, options).totalUsd,
    higgsfield.totalUsd,
  );
  assert.equal(
    quotedProductionEstimate("mock", film, options, { openrouter: true })
      .pricedOn,
    "mock",
  );
  // An engine dearer than OpenRouter keeps its own price.
  const silent = [{ duration_s: 5, voiceover_text: "" }];
  assert.equal(
    quotedProductionEstimate("elevenlabs", silent, options, {
      openrouter: true,
    }).pricedOn,
    "elevenlabs",
  );
});

test("a talking scene on an engine that cannot speak is quoted at the OpenRouter Veo fallback", () => {
  const talking = [
    { duration_s: 6, voiceover_text: "", lipsync: true, dialogue: "בואו לבקר" },
  ];
  const free = quotedProductionEstimate(
    "mock",
    talking,
    { withVoice: true, withMusic: false },
    { openrouter: true },
  );
  assert.ok(free.lipsync.usd >= 6 * 0.4 - 0.01, String(free.lipsync.usd));
  const without = quotedProductionEstimate("mock", talking, {
    withVoice: true,
    withMusic: false,
  });
  assert.ok(without.lipsync.usd < free.lipsync.usd);
});

test("an OpenRouter clip shorter than 5 s is quoted at the 5 s it is billed for", () => {
  const short = clipEstimate("openrouter", [
    { duration_s: 3, voiceover_text: "" },
  ]);
  assert.equal(short.usd, 0.42);
  assert.equal(short.seconds, 3);
});
