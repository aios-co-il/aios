import { expect, test } from "vitest";
import {
  NOT_IN_PRODUCTION,
  SOUND_EFFECTS,
  effectsByKind,
  filmSoundEffects,
  soundEffectsCostUsd,
} from "../src/jobs/sound-effects.mjs";
import {
  SOUND_EFFECTS_VERSION,
  SOUND_EFFECT_NAMES,
  TRANSITION_NAMES,
} from "../src/jobs/sound-effects-catalog.mjs";
import {
  generateSoundEffect,
  soundEffectBody,
} from "../src/providers/elevenlabsSound.mjs";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ITEM = "22222222-2222-2222-2222-222222222222";

test("a sound effect is asked of ElevenLabs as the public API documents it", async () => {
  expect(soundEffectBody({ text: "whoosh", durationS: 40 })).toStrictEqual({
    text: "whoosh",
    duration_seconds: 30,
    prompt_influence: 0.5,
    model_id: "eleven_text_to_sound_v2",
  });
  const seen = [];
  const bytes = await generateSoundEffect({
    apiKey: "xi-test",
    text: "low hit",
    durationS: 2.5,
    promptInfluence: 0.6,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return new Response(new Uint8Array([0xff, 0xfb, 1, 2]), { status: 200 });
    },
  });
  expect(bytes.length).toBe(4);
  expect(seen[0].url).toBe(
    "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
  );
  expect(seen[0].init.method).toBe("POST");
  expect(seen[0].init.headers["xi-api-key"]).toBe("xi-test");
  expect(JSON.parse(seen[0].init.body)).toStrictEqual({
    text: "low hit",
    duration_seconds: 2.5,
    prompt_influence: 0.6,
    model_id: "eleven_text_to_sound_v2",
  });
  await expect(
    generateSoundEffect({
      apiKey: "xi-test",
      text: "x",
      durationS: 1,
      fetchImpl: async () =>
        new Response('{"detail":{"status":"invalid_api_key"}}', {
          status: 401,
        }),
    }),
  ).rejects.toThrow(/sound effect 401/);
});

function effectsDb({ assets = [], failUpload = false } = {}) {
  const calls = { uploads: [], updates: [], inserts: [] };
  return {
    calls,
    async select(table) {
      return table === "marketing_assets" ? assets : [];
    },
    async upload(bucket, path, bytes) {
      if (failUpload) throw new Error("storage down");
      calls.uploads.push({ bucket, path, size: bytes.length });
    },
    async update(table, filter, patch) {
      calls.updates.push({ table, filter, patch });
    },
    async insert(table, row) {
      calls.inserts.push({ table, row });
    },
  };
}

const run = (output = {}) => ({
  id: "run-1",
  tenant_id: TENANT,
  item_id: ITEM,
  stage_id: "stage-1",
  output,
});
const item = { folder: `${TENANT}/general/${ITEM}` };
/** A stored effect of the film, as marketing_assets returns it. */
const asset = (effect, version = SOUND_EFFECTS_VERSION) => ({
  url: `t/${effect}-v${version}.mp3`,
  meta: { effect, version },
});
const ALL = SOUND_EFFECT_NAMES;

test("the film's set is made once, each sound stored, recorded on the run and priced", async () => {
  const db = effectsDb();
  const asked = [];
  const current = run();
  const result = await filmSoundEffects({
    db,
    run: current,
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate: async (input) => {
      asked.push(input);
      return new Uint8Array([1, 2, 3]);
    },
    log: () => {},
  });
  // Six transition sounds and the impact, each asked once with its own prompt and length.
  expect(asked.map((input) => input.text)).toStrictEqual(
    ALL.map((name) => SOUND_EFFECTS[name].text),
  );
  expect(asked.map((input) => input.durationS)).toStrictEqual([
    1, 1, 0.7, 1, 1.2, 0.6, 2,
  ]);
  expect(asked.every((input) => input.apiKey === "xi-key")).toBe(true);
  expect(Object.keys(result.paths)).toStrictEqual(ALL);
  expect(result.paths.air).toBe(`${item.folder}/sound-effects/air-run-1.mp3`);
  expect(result.error).toBe(null);
  // 7.5 s at 40 credits a second: what the quote prices.
  expect(result.costUsd).toBe(soundEffectsCostUsd(ALL));
  expect(result.costUsd).toBeCloseTo(7.5 * 40 * 0.0003, 4);
  expect(db.calls.uploads.length).toBe(7);
  expect(new Set(db.calls.uploads.map((u) => u.bucket))).toStrictEqual(
    new Set(["creative-video"]),
  );
  // Each stored path and its price are on the run before the next sound is paid for.
  expect(db.calls.updates[0].patch.output.sound_effects).toStrictEqual({
    air: result.paths.air,
  });
  expect(db.calls.updates[0].patch.output.sound_effects_cost_usd).toStrictEqual(
    { air: soundEffectsCostUsd(["air"]) },
  );
  expect(current.output.sound_effects).toStrictEqual(result.paths);
  expect(Object.keys(current.output.sound_effects_cost_usd)).toStrictEqual(ALL);
  // Each sound is the film's asset, named after it, so later renders find it.
  expect(db.calls.inserts.map((i) => i.row.type)).toStrictEqual(
    Array(7).fill("sound_effect"),
  );
  expect(db.calls.inserts.map((i) => i.row.meta.effect)).toStrictEqual(ALL);
  expect(db.calls.inserts[2].row.meta).toMatchObject({
    effect: "blip",
    kind: "transition",
    version: SOUND_EFFECTS_VERSION,
    provider: "elevenlabs",
    duration_s: 0.7,
    cost_usd: soundEffectsCostUsd(["blip"]),
  });
  expect(db.calls.inserts[6].row.meta).toMatchObject({
    effect: "impact",
    kind: "impact",
  });
  expect(effectsByKind(result.paths)).toStrictEqual({
    transitions: TRANSITION_NAMES.map((name) => ({
      name,
      path: result.paths[name],
    })),
    impact: result.paths.impact,
  });
});

test("a later render reuses each stored sound and makes only the missing ones, once", async () => {
  let paid = [];
  const generate = async ({ text }) => {
    paid.push(ALL.find((name) => SOUND_EFFECTS[name].text === text));
    return new Uint8Array([1]);
  };
  const reused = await filmSoundEffects({
    db: effectsDb({
      assets: [...ALL.map((name) => asset(name)), asset("impact", 0)],
    }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
  });
  expect(reused).toStrictEqual({
    paths: Object.fromEntries(ALL.map((name) => [name, `t/${name}-v2.mp3`])),
    costUsd: 0,
    error: null,
  });
  expect(paid).toStrictEqual([]);
  // A film with part of the set: the next production pays only for the rest.
  const part = await filmSoundEffects({
    db: effectsDb({
      assets: [asset("air"), asset("chime"), asset("impact")],
    }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
    log: () => {},
  });
  expect(paid).toStrictEqual(["shimmer", "blip", "swish", "swipe"]);
  expect(part.paths.air).toBe("t/air-v2.mp3");
  expect(part.paths.blip).toBe(`${item.folder}/sound-effects/blip-run-1.mp3`);
  expect(part.costUsd).toBe(
    soundEffectsCostUsd(["shimmer", "blip", "swish", "swipe"]),
  );
  paid = [];
  // A retry of the run reuses what its first attempt stored.
  const retried = await filmSoundEffects({
    db: effectsDb({ assets: [asset("air")] }),
    run: run({
      sound_effects: Object.fromEntries(
        ALL.slice(1).map((name) => [name, `t/attempt-1-${name}.mp3`]),
      ),
    }),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
  });
  expect(retried.paths.air).toBe("t/air-v2.mp3");
  expect(retried.paths.swipe).toBe("t/attempt-1-swipe.mp3");
  expect(retried.error).toBe(null);
  // A charged effect that could not be stored is not made again on the retry.
  const stopped = await filmSoundEffects({
    db: effectsDb(),
    run: run({ sound_effects_error: "stored failed" }),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
  });
  expect(stopped.error).toBe("stored failed");
  expect(paid).toStrictEqual([]);
});

test("a film made before the set keeps its one whoosh and impact until a production makes the set", async () => {
  const assets = [asset("whoosh", 1), asset("impact", 1)];
  let paid = 0;
  const generate = async () => {
    paid += 1;
    return new Uint8Array([1]);
  };
  const free = await filmSoundEffects({
    db: effectsDb({ assets }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    generate,
  });
  expect(free.paths).toStrictEqual({
    whoosh: "t/whoosh-v1.mp3",
    impact: "t/impact-v1.mp3",
  });
  expect(free.error).toBe(NOT_IN_PRODUCTION);
  expect(effectsByKind(free.paths)).toStrictEqual({
    transitions: [{ name: "whoosh", path: "t/whoosh-v1.mp3" }],
    impact: "t/impact-v1.mp3",
  });
  expect(paid).toBe(0);
  // The production makes the whole set; the old ones are then left out.
  const made = await filmSoundEffects({
    db: effectsDb({ assets }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
    log: () => {},
  });
  expect(paid).toBe(7);
  expect(Object.keys(made.paths)).toStrictEqual(ALL);
  expect(made.paths.impact).toBe(
    `${item.folder}/sound-effects/impact-run-1.mp3`,
  );
  // Part of the set stands alone: the old whoosh never plays beside the new sounds.
  const part = await filmSoundEffects({
    db: effectsDb({ assets: [...assets, asset("swish")] }),
    run: run(),
    item,
    generate,
  });
  expect(part.paths).toStrictEqual({
    swish: "t/swish-v2.mp3",
    impact: "t/impact-v1.mp3",
  });
});

test("without a working key the film has no effects and says why once", async () => {
  const noKey = await filmSoundEffects({
    db: effectsDb(),
    run: run(),
    item,
    resolveKey: async () => null,
    mayGenerate: true,
    generate: async () => {
      throw new Error("not called");
    },
  });
  expect(noKey.paths).toStrictEqual({});
  expect(noKey.error).toMatch(/אין מפתח ElevenLabs/);

  let calls = 0;
  const db = effectsDb();
  const current = run();
  const refused = await filmSoundEffects({
    db,
    run: current,
    item,
    resolveKey: async () => "xi-bad",
    mayGenerate: true,
    generate: async () => {
      calls += 1;
      throw new Error(
        'elevenlabs sound effect 401: {"status":"invalid_api_key"}',
      );
    },
    log: () => {},
  });
  // The same key refuses the rest of the set: one call, not seven.
  expect(calls).toBe(1);
  expect(refused.error).toMatch(/מפתח ה-ElevenLabs לא תקין/);
  expect(refused.costUsd).toBe(0);
  expect(current.output.sound_effects_error).toBe(refused.error);

  const lost = await filmSoundEffects({
    db: effectsDb({ failUpload: true }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate: async () => new Uint8Array([1]),
    log: () => {},
  });
  expect(lost.error).toMatch(/לא נוצר שוב/);
  // The provider charged for the one it made.
  expect(lost.costUsd).toBe(soundEffectsCostUsd(["air"]));
});

test("a render outside a production never pays: it reuses stored effects or goes without", async () => {
  let paid = 0;
  const generate = async () => {
    paid += 1;
    return new Uint8Array([1]);
  };
  const free = await filmSoundEffects({
    db: effectsDb(),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    generate,
  });
  expect(free).toStrictEqual({
    paths: {},
    costUsd: 0,
    error: NOT_IN_PRODUCTION,
  });
  const stored = await filmSoundEffects({
    db: effectsDb({ assets: ALL.map((name) => asset(name)) }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    generate,
  });
  expect(stored.error).toBe(null);
  expect(stored.costUsd).toBe(0);
  expect(paid).toBe(0);
});

test("a retry of the run still reports what its first attempt paid for the effects", async () => {
  // Attempt 1 makes and stores the set; the render then fails, and the worker requeues the
  // run with the output that attempt wrote (finish() never wrote its cost_usd).
  const first = effectsDb();
  const attempt1 = run();
  const made = await filmSoundEffects({
    db: first,
    run: attempt1,
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate: async () => new Uint8Array([1, 2]),
    log: () => {},
  });
  const all = soundEffectsCostUsd(ALL);
  expect(made.costUsd).toBe(all);
  const persisted = first.calls.updates.at(-1).patch.output;
  expect(persisted.sound_effects_cost_usd).toStrictEqual(
    Object.fromEntries(ALL.map((name) => [name, soundEffectsCostUsd([name])])),
  );

  let paid = 0;
  const assets = first.calls.inserts.map(({ row }) => ({
    url: row.url,
    meta: row.meta,
  }));
  // The retry finds the effects as the film's assets and through the run's output alike.
  for (const db of [effectsDb({ assets }), effectsDb()]) {
    const retried = await filmSoundEffects({
      db,
      run: run(structuredClone(persisted)),
      item,
      resolveKey: async () => "xi-key",
      mayGenerate: true,
      generate: async () => {
        paid += 1;
        return new Uint8Array([1]);
      },
      log: () => {},
    });
    expect(retried.paths).toStrictEqual(made.paths);
    expect(retried.costUsd).toBe(all);
    expect(retried.error).toBe(null);
  }
  expect(paid).toBe(0);

  // A charged effect that could not be stored keeps its price on the retry too.
  const lostRun = run();
  await filmSoundEffects({
    db: effectsDb({ failUpload: true }),
    run: lostRun,
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate: async () => new Uint8Array([1]),
    log: () => {},
  });
  const again = await filmSoundEffects({
    db: effectsDb(),
    run: run(structuredClone(lostRun.output)),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate: async () => {
      paid += 1;
      return new Uint8Array([1]);
    },
  });
  expect(again.costUsd).toBe(soundEffectsCostUsd(["air"]));
  expect(paid).toBe(0);
});
