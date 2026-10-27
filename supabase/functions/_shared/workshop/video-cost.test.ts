import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  musicEstimate as appMusic,
  sceneEstimate as appScenes,
  voiceEstimate as appVoice,
} from "../../../../src/components/marketing/departments/creative/videoEngines.ts";
import {
  clipEstimate,
  costSceneOf,
  engineFromKeys,
  lipsyncEstimate,
  musicEstimate,
  productionEstimate,
  quotedProductionEstimate,
  relipEstimate,
  SOUND_EFFECTS_USD,
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
  "a production adds clips, the spoken scenes and the music bed",
  () => {
    const full = productionEstimate("elevenlabs", scenes, {
      withVoice: true,
      withMusic: true,
    });
    assertStrictEquals(full.clips.usd, 3);
    assert(full.totalUsd > full.clips.usd);
    const silent = productionEstimate("mock", scenes, {
      withVoice: false,
      withMusic: false,
    });
    assertStrictEquals(silent.totalUsd, 0);
  },
);

Deno.test(
  "a talking scene adds a lip-sync pass on a silent engine and nothing on one that speaks",
  () => {
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
    assertStrictEquals(silent.lipsync.usd, 0.3);
    assertStrictEquals(silent.talkingScenes, 1);
    assertStrictEquals(silent.voice.usd, voiceEstimate([talking[1]]).usd);
    assertStrictEquals(
      silent.totalUsd,
      Math.round(
        (silent.clips.usd + silent.voice.usd + silent.lipsync.usd) * 100,
      ) / 100,
    );
    assertEquals(lipsyncEstimate("kling", talking).native, false);
    const native = productionEstimate("elevenlabs", talking, {
      withVoice: true,
      withMusic: false,
    });
    assertStrictEquals(native.lipsync.usd, 0);
    assertStrictEquals(lipsyncEstimate("higgsfield", talking).native, true);
    assertStrictEquals(
      productionEstimate("mock", scenes, { withVoice: false, withMusic: false })
        .lipsync.usd,
      0,
    );
    assert(speaksNatively("elevenlabs") && !speaksNatively("mock"));
  },
);

Deno.test("the engine follows the keys the tenant has", () => {
  assertStrictEquals(
    engineFromKeys({ elevenlabs_api_key: "xi-1" }),
    "elevenlabs",
  );
  assertStrictEquals(
    engineFromKeys({
      higgsfield_api_key_id: "a",
      higgsfield_api_key_secret: "b",
    }),
    "higgsfield",
  );
  assertStrictEquals(engineFromKeys({ higgsfield_api_key_id: "a" }), "mock");
  assertStrictEquals(
    engineFromKeys({ higgsfield_api_key_secret: "id-1:secret-1" }),
    "higgsfield",
  );
  assertStrictEquals(engineFromKeys({}), "mock");
});

Deno.test("Starter ElevenLabs video moves to Higgsfield", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ tier: "starter" }), {
      status: 200,
    })) as typeof fetch;
  assertStrictEquals(
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
  assertStrictEquals(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, fetchImpl),
    "mock",
  );
  const pro = (async () =>
    new Response(JSON.stringify({ tier: "pro" }), {
      status: 200,
    })) as typeof fetch;
  assertStrictEquals(
    await sceneEngineFor({ elevenlabs_api_key: "xi" }, pro),
    "elevenlabs",
  );
});

Deno.test(
  "a connected OpenRouter brain is the video engine before ElevenLabs and Higgsfield",
  async () => {
    const openrouter = { openrouter: true };
    assertStrictEquals(engineFromKeys({}, openrouter), "openrouter");
    assertStrictEquals(
      engineFromKeys({ elevenlabs_api_key: "xi" }, openrouter),
      "openrouter",
    );
    assertStrictEquals(
      engineFromKeys({ higgsfield_api_key_secret: "a:b" }, openrouter),
      "openrouter",
    );
    assertStrictEquals(
      engineFromKeys({ elevenlabs_api_key: "xi" }),
      "elevenlabs",
    );
    assertStrictEquals(
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
    assertStrictEquals(
      await sceneEngineFor({ elevenlabs_api_key: "xi" }, starter, openrouter),
      "openrouter",
    );
    assertStrictEquals(
      await sceneEngineFor({}, starter, openrouter),
      "openrouter",
    );
    assertStrictEquals(await sceneEngineFor({}, starter), "mock");
  },
);

Deno.test(
  "OpenRouter quotes Kling 3 lengths and adds the Veo price for talking scenes",
  () => {
    const clips = clipEstimate("openrouter", scenes);
    assertStrictEquals(clips.seconds, 3 + 7 + 12);
    // The 3 s clip is billed as 5 s: (5 + 7 + 12) × $0.084.
    assertStrictEquals(clips.usd, 2.02);
    assert(speaksNatively("openrouter"));
    const talking = lipsyncEstimate("openrouter", [
      { duration_s: 5, voiceover_text: "", lipsync: true, dialogue: "שלום" },
    ]);
    assertStrictEquals(talking.native, true);
    // Veo 3.1 6 s at $0.40 instead of a 5 s Kling clip at $0.084.
    assertStrictEquals(talking.usd, 1.98);
  },
);

Deno.test(
  "a paid engine that can fall back to OpenRouter is quoted at the dearer of the two",
  () => {
    const film = [
      { duration_s: 5, voiceover_text: "" },
      { duration_s: 5, voiceover_text: "" },
      { duration_s: 8, voiceover_text: "", lipsync: true, dialogue: "שלום" },
    ];
    const options = { withVoice: false, withMusic: true };
    const higgsfield = productionEstimate("higgsfield", film, options);
    const openrouter = productionEstimate("openrouter", film, options);
    assert(openrouter.totalUsd > higgsfield.totalUsd);

    const quoted = quotedProductionEstimate("higgsfield", film, options, {
      openrouter: true,
    });
    assertStrictEquals(quoted.totalUsd, openrouter.totalUsd);
    assertStrictEquals(quoted.pricedOn, "openrouter");
    // Without OpenRouter nothing can take over, and the free preview never falls back.
    assertStrictEquals(
      quotedProductionEstimate("higgsfield", film, options).totalUsd,
      higgsfield.totalUsd,
    );
    assertStrictEquals(
      quotedProductionEstimate("mock", film, options, { openrouter: true })
        .pricedOn,
      "mock",
    );
    // An engine dearer than OpenRouter keeps its own price.
    const silent = [{ duration_s: 5, voiceover_text: "" }];
    assertStrictEquals(
      quotedProductionEstimate("elevenlabs", silent, options, {
        openrouter: true,
      }).pricedOn,
      "elevenlabs",
    );
  },
);

Deno.test(
  "a talking scene on an engine that cannot speak is quoted at the OpenRouter Veo fallback",
  () => {
    const talking = [
      {
        duration_s: 6,
        voiceover_text: "",
        lipsync: true,
        dialogue: "בואו לבקר",
      },
    ];
    const free = quotedProductionEstimate(
      "mock",
      talking,
      { withVoice: true, withMusic: false },
      { openrouter: true },
    );
    assert(free.lipsync.usd >= 6 * 0.4 - 0.01, String(free.lipsync.usd));
    const without = quotedProductionEstimate("mock", talking, {
      withVoice: true,
      withMusic: false,
    });
    assert(without.lipsync.usd < free.lipsync.usd);
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

Deno.test(
  "a production with trailer sound design is quoted with its sound effects",
  () => {
    const film = [{ duration_s: 5, voiceover_text: "שלום" }];
    const options = { withVoice: true, withMusic: true };
    const plain = quotedProductionEstimate("higgsfield", film, options, {
      openrouter: true,
    });
    const trailer = quotedProductionEstimate(
      "higgsfield",
      film,
      { ...options, withSoundEffects: true },
      { openrouter: true },
    );
    assertStrictEquals(plain.soundEffects.usd, 0);
    assertStrictEquals(trailer.soundEffects.usd, SOUND_EFFECTS_USD);
    assertStrictEquals(
      trailer.totalUsd,
      Math.round((plain.totalUsd + SOUND_EFFECTS_USD) * 100) / 100,
    );
    // The free preview still pays ElevenLabs for the effects.
    assertStrictEquals(
      productionEstimate("mock", film, { ...options, withSoundEffects: true })
        .soundEffects.usd,
      SOUND_EFFECTS_USD,
    );
    // 3.7 s of effects at 40 credits a second and $0.0003 a credit, rounded up to the cent.
    assert(SOUND_EFFECTS_USD >= 3.7 * 40 * 0.0003);
  },
);

Deno.test(
  "a talking scene in the chosen voice pays for its lip-sync pass even on an engine that speaks",
  () => {
    const own = {
      duration_s: 5,
      voiceover_text: "",
      lipsync: true,
      dialogue: "שלום",
      chosen_voice: true,
    };
    const engineVoice = { ...own, chosen_voice: false };
    // 5 s of lip sync at $0.10; a four-letter line costs less than a cent.
    for (const engine of ["elevenlabs", "higgsfield", "kling", "mock"] as const)
      assertEquals(lipsyncEstimate(engine, [own]), {
        usd: 0.5,
        credits: 0,
        scenes: 1,
        native: false,
      });
    assertStrictEquals(lipsyncEstimate("elevenlabs", [engineVoice]).usd, 0);
    // On OpenRouter the engine-spoken scene adds the Veo difference, the chosen voice its pass.
    const mixed = lipsyncEstimate("openrouter", [own, engineVoice]);
    const veoOnly = lipsyncEstimate("openrouter", [engineVoice]);
    assertStrictEquals(mixed.native, false);
    assertStrictEquals(mixed.usd, Math.round((veoOnly.usd + 0.5) * 100) / 100);
    // The quote counts the pass in the film's total; the line is not narrated as well.
    const film = productionEstimate("elevenlabs", [own], {
      withVoice: true,
      withMusic: false,
    });
    assertStrictEquals(film.lipsync.usd, 0.5);
    assertStrictEquals(film.voice.usd, 0);
    assertStrictEquals(
      film.totalUsd,
      Math.round((film.clips.usd + 0.5) * 100) / 100,
    );
    // Veo, the end of the lip-sync chain, would speak in its own voice: it is never used for a
    // line in the chosen voice, so it is not quoted for one either.
    const quoted = quotedProductionEstimate(
      "kling",
      [own],
      { withVoice: true, withMusic: false },
      { openrouter: true },
    );
    assertStrictEquals(quoted.lipsync.usd, 0.5);
    const engineLine = quotedProductionEstimate(
      "kling",
      [engineVoice],
      { withVoice: true, withMusic: false },
      { openrouter: true },
    );
    assert(engineLine.lipsync.usd >= 6 * 0.4 - 0.01);
  },
);

Deno.test(
  "a kept talking scene with a new line is quoted as its lip sync alone",
  () => {
    const relip = [
      {
        duration_s: 4,
        voiceover_text: "",
        lipsync: true,
        dialogue: "אני הקמפיינרית שלך",
        chosen_voice: true,
      },
    ];
    const again = relipEstimate(relip);
    // 4 s of lip sync at $0.10 plus the voice line.
    assert(again.usd >= 0.4 && again.usd < 0.5, String(again.usd));
    // A line in the chosen voice never goes to Veo, so OpenRouter does not change its price.
    assertEquals(relipEstimate(relip, { openrouter: true }), again);
    // Not a chosen voice: the worker's chain may end at Veo, so the dearer one is quoted.
    const engineVoice = [{ ...relip[0], chosen_voice: false }];
    assertEquals(relipEstimate(engineVoice, { openrouter: true }).usd, 1.6);
    const quote = quotedProductionEstimate(
      "elevenlabs",
      [],
      { withVoice: false, withMusic: false },
      {},
      relip,
    );
    assertEquals(quote.totalUsd, again.usd);
    assertEquals(quote.lipsync.usd, again.usd);
    assertEquals(quote.talkingScenes, 1);
    // Nothing kept to redo: the quote is unchanged.
    assertEquals(
      quotedProductionEstimate("elevenlabs", [], {
        withVoice: false,
        withMusic: false,
      }).totalUsd,
      0,
    );
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
