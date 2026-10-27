import { afterEach, expect, test, vi } from "vitest";
import { generateMusic, generateVoice } from "../src/jobs/sound.mjs";
import {
  openRouterSpeechBody,
  synthesizeOpenRouterSpeech,
} from "../src/providers/openrouterTts.mjs";

const TENANT = "t1";
const ITEM = "item1";
const VOICE = "d4eLZ8u5dfBCsjp4YPyz";

afterEach(() => vi.unstubAllGlobals());

function fakeDb(run) {
  const calls = [];
  return {
    calls,
    async select(table) {
      if (table === "marketing_work_items")
        return [{ id: ITEM, tenant_id: TENANT, client_id: "c1" }];
      if (table === "marketing_video_scenes")
        return [
          { id: "s1", voiceover_text: "שלום לכולם", meta: {} },
          { id: "s2", voiceover_text: "תודה שבאתם", meta: {} },
        ];
      return [];
    },
    async upload(_bucket, path, bytes, contentType) {
      calls.push(["upload", path, bytes.length, contentType]);
    },
    async update(_table, _filter, patch) {
      calls.push(["update", patch.output.audio_meta.provider]);
      run.output = patch.output;
    },
    async rpc(name, args) {
      calls.push(["rpc", name, args.p_meta?.provider]);
    },
    async insert() {},
  };
}

const voiceRun = () => ({
  id: "run1",
  tenant_id: TENANT,
  item_id: ITEM,
  scene_id: null,
  input: { continuous: true, voice_id: VOICE },
  output: {},
});

const audio = (headers = {}) =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { "content-type": "audio/mpeg", ...headers },
  });

test("the request asks Eleven v4 for an mp3 in the chosen ElevenLabs voice", () => {
  expect(openRouterSpeechBody("שלום", VOICE)).toStrictEqual({
    model: "elevenlabs/eleven-v4",
    input: "שלום",
    voice: VOICE,
    response_format: "mp3",
  });
});

test("a rejected ElevenLabs key narrates through OpenRouter at the price it reports", async () => {
  const urls = [];
  vi.stubGlobal("fetch", async (url, init) => {
    urls.push(String(url));
    if (String(url).includes("api.elevenlabs.io"))
      return new Response(
        JSON.stringify({ detail: { status: "invalid_api_key" } }),
        { status: 401 },
      );
    if (String(url).endsWith("/audio/speech")) {
      expect(init.headers.Authorization).toBe("Bearer sk-or");
      expect(JSON.parse(init.body).voice).toBe(VOICE);
      return audio({ "x-generation-id": "gen-1" });
    }
    if (String(url).includes("/generation?id=gen-1"))
      return new Response(JSON.stringify({ data: { total_cost: 0.0017 } }));
    throw new Error(`unexpected ${url}`);
  });
  const run = voiceRun();
  const db = fakeDb(run);
  const result = await generateVoice({
    db,
    run,
    apiKey: "bad-eleven",
    googleKey: null,
    resolveOpenRouterKey: async () => "sk-or",
    log: () => {},
  });
  expect(result.provider).toBe("openrouter");
  expect(result.costUsd).toBe(0.0017);
  // The audio is stored and recorded on the run before the narration is attached.
  expect(db.calls.map((call) => call[0])).toStrictEqual([
    "upload",
    "update",
    "rpc",
  ]);
  expect(db.calls[0][3]).toBe("audio/mpeg");
  expect(run.output.audio_meta.cost_reported).toBe(true);
  // A retry of the same run reuses the stored audio and pays nothing.
  urls.length = 0;
  await generateVoice({
    db,
    run,
    apiKey: "bad-eleven",
    resolveOpenRouterKey: async () => "sk-or",
    log: () => {},
  });
  expect(urls).toStrictEqual([]);
});

test("without an ElevenLabs key OpenRouter narrates before Gemini and estimates a missing price", async () => {
  const urls = [];
  vi.stubGlobal("fetch", async (url) => {
    urls.push(String(url));
    if (String(url).endsWith("/audio/speech")) return audio();
    throw new Error(`unexpected ${url}`);
  });
  const run = voiceRun();
  const result = await generateVoice({
    db: fakeDb(run),
    run,
    apiKey: null,
    googleKey: "g",
    resolveOpenRouterKey: async () => "sk-or",
    log: () => {},
  });
  expect(result.provider).toBe("openrouter");
  // "שלום לכולם תודה שבאתם" is 21 characters at $0.00008.
  expect(result.costUsd).toBe(0.0017);
  expect(run.output.audio_meta.cost_reported).toBe(false);
  expect(urls).toStrictEqual(["https://openrouter.ai/api/v1/audio/speech"]);
});

test("a voice OpenRouter cannot use is retried once with a premade voice", async () => {
  const voices = [];
  const fetchImpl = async (_url, init) => {
    const voice = JSON.parse(init.body).voice;
    voices.push(voice);
    return voice === "sarah"
      ? audio()
      : new Response(
          JSON.stringify({ error: { message: "voice not found" } }),
          {
            status: 400,
          },
        );
  };
  const speech = await synthesizeOpenRouterSpeech({
    apiKey: "k",
    voiceId: "myClonedVoice1234567",
    text: "שלום",
    fetchImpl,
  });
  expect(voices).toStrictEqual(["myClonedVoice1234567", "sarah"]);
  expect(speech.voice).toBe("sarah");
});

test("an OpenRouter refusal with no Gemini key fails before anything is stored", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: { message: "no credits" } }), {
        status: 402,
      }),
  );
  const run = voiceRun();
  const db = fakeDb(run);
  await expect(
    generateVoice({
      db,
      run,
      apiKey: null,
      resolveOpenRouterKey: async () => "sk-or",
      log: () => {},
    }),
  ).rejects.toThrow("openrouter speech 402");
  expect(db.calls).toStrictEqual([]);
});

test("music without a working ElevenLabs key fails once, so the film is assembled without it", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ detail: "invalid_api_key" }), {
        status: 401,
      }),
  );
  const run = {
    id: "run2",
    tenant_id: TENANT,
    item_id: ITEM,
    input: { prompt: "upbeat", music_length_ms: 20000 },
    output: {},
  };
  const error = await generateMusic({
    db: fakeDb(run),
    run,
    apiKey: "bad-eleven",
    log: () => {},
  }).catch((caught) => caught);
  expect(error.final).toBe(true);
  expect(error.message).toContain("בלי מיטת מוזיקה");
});
