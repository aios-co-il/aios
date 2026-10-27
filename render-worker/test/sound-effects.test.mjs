import { expect, test } from "vitest";
import {
  NOT_IN_PRODUCTION,
  filmSoundEffects,
  soundEffectsCostUsd,
} from "../src/jobs/sound-effects.mjs";
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

test("the film's effects are made once, stored, recorded on the run and priced", async () => {
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
  expect(asked.map((input) => input.durationS)).toStrictEqual([1.2, 2.5]);
  expect(asked.every((input) => input.apiKey === "xi-key")).toBe(true);
  expect(Object.keys(result.paths)).toStrictEqual(["whoosh", "impact"]);
  expect(result.paths.whoosh).toBe(
    `${item.folder}/sound-effects/whoosh-run-1.mp3`,
  );
  expect(result.error).toBe(null);
  // 3.7 s at 40 credits a second.
  expect(result.costUsd).toBe(soundEffectsCostUsd(["whoosh", "impact"]));
  expect(result.costUsd).toBeCloseTo(3.7 * 40 * 0.0003, 4);
  expect(db.calls.uploads.map((u) => u.bucket)).toStrictEqual([
    "creative-video",
    "creative-video",
  ]);
  // Each stored path is on the run before the next effect is paid for.
  expect(db.calls.updates[0].patch.output.sound_effects).toStrictEqual({
    whoosh: result.paths.whoosh,
  });
  expect(current.output.sound_effects).toStrictEqual(result.paths);
  expect(db.calls.inserts.map((i) => i.row.type)).toStrictEqual([
    "sound_effect",
    "sound_effect",
  ]);
  expect(db.calls.inserts[1].row.meta).toMatchObject({
    effect: "impact",
    version: 1,
    provider: "elevenlabs",
  });
});

test("a later render reuses the film's effects, and a retry never pays twice", async () => {
  let paid = 0;
  const generate = async () => {
    paid += 1;
    return new Uint8Array([1]);
  };
  const reused = await filmSoundEffects({
    db: effectsDb({
      assets: [
        { url: "t/whoosh.mp3", meta: { effect: "whoosh", version: 1 } },
        { url: "t/impact.mp3", meta: { effect: "impact", version: 1 } },
        { url: "t/old.mp3", meta: { effect: "impact", version: 0 } },
      ],
    }),
    run: run(),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
  });
  expect(reused).toStrictEqual({
    paths: { whoosh: "t/whoosh.mp3", impact: "t/impact.mp3" },
    costUsd: 0,
    error: null,
  });
  const retried = await filmSoundEffects({
    db: effectsDb({
      assets: [{ url: "t/w.mp3", meta: { effect: "whoosh", version: 1 } }],
    }),
    run: run({ sound_effects: { impact: "t/from-attempt-1.mp3" } }),
    item,
    resolveKey: async () => "xi-key",
    mayGenerate: true,
    generate,
  });
  expect(retried.paths).toStrictEqual({
    whoosh: "t/w.mp3",
    impact: "t/from-attempt-1.mp3",
  });
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
  expect(paid).toBe(0);
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
  expect(lost.costUsd).toBe(soundEffectsCostUsd(["whoosh"]));
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
    db: effectsDb({
      assets: [
        { url: "t/whoosh.mp3", meta: { effect: "whoosh", version: 1 } },
        { url: "t/impact.mp3", meta: { effect: "impact", version: 1 } },
      ],
    }),
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
  // Attempt 1 makes and stores both effects; the render then fails, and the worker requeues
  // the run with the output that attempt wrote (finish() never wrote its cost_usd).
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
  const both = soundEffectsCostUsd(["whoosh", "impact"]);
  expect(made.costUsd).toBe(both);
  const persisted = first.calls.updates.at(-1).patch.output;
  expect(persisted.sound_effects_cost_usd).toStrictEqual({
    whoosh: soundEffectsCostUsd(["whoosh"]),
    impact: soundEffectsCostUsd(["impact"]),
  });

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
    expect(retried.costUsd).toBe(both);
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
  expect(again.costUsd).toBe(soundEffectsCostUsd(["whoosh"]));
  expect(paid).toBe(0);
});
