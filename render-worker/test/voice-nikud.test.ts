import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { generateVoice } from "../src/jobs/sound.ts";
import {
  clearVocalizedCache,
  vocalizeForSpeech,
} from "../src/jobs/vocalize.ts";

// Dicta's answer for these words: it writes בוקר without its mater (בֹּקֶר).
const PLAIN = "הקפה שלנו נקלה בכל בוקר.";
const POINTED = "הַקָּפֶה שֶׁלָּנוּ נְקַלָּה בְּכָל בֹּקֶר.";

beforeEach(() => clearVocalizedCache());
afterEach(() => vi.unstubAllGlobals());

/**
 * A voice run over one scene row whose text is PLAIN; records what the run stores. With
 * `restUpdate`, the update only reaches the database (as the REST client does), not the run.
 */
function voiceFixture(
  input: Record<string, unknown>,
  sceneMeta = {},
  { restUpdate = false } = {},
) {
  const run = {
    id: "run1",
    tenant_id: "t1",
    item_id: "item1",
    scene_id: input.continuous ? null : "s1",
    input,
    output: {} as { audio_path?: string; audio_meta?: Record<string, unknown> },
  };
  const rpcs = [];
  const updates = [];
  const db = {
    async select(table) {
      if (table === "marketing_work_items") {
        return [{ id: "item1", tenant_id: "t1", client_id: "c1" }];
      }
      return [{ id: "s1", voiceover_text: PLAIN, meta: sceneMeta }];
    },
    async upload() {},
    async update(_table, _filter, patch) {
      updates.push(patch);
      if (!restUpdate) {
        run.output = patch.output;
      }
    },
    async rpc(name, args) {
      rpcs.push([name, args.p_meta]);
    },
  };
  return { run, db, rpcs, updates };
}

const pointedVocalize = (text: string) =>
  vocalizeForSpeech(text, { vocalizer: async () => POINTED });

/** ElevenLabs answers with timings for exactly what it was sent, and optionally a billed count. */
function stubElevenLabs(sent: Array<string>, characterCost?: string) {
  vi.stubGlobal("fetch", async (_url, init) => {
    const { text } = JSON.parse(init.body);
    sent.push(text);
    const characters = text.split("");
    return Response.json(
      {
        audio_base64: "AQID",
        alignment: {
          characters,
          character_start_times_seconds: characters.map((_, at) => at / 10),
          character_end_times_seconds: characters.map((_, at) => (at + 1) / 10),
        },
      },
      { headers: characterCost ? { "character-cost": characterCost } : {} },
    );
  });
}

describe("the voice run", () => {
  test("ElevenLabs hears the pointed script; the stored script and its timings stay plain", async () => {
    const sent = [];
    stubElevenLabs(sent);
    const { run, db, rpcs } = voiceFixture({
      continuous: true,
      voice_id: "v1",
    });
    const result = await generateVoice({
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize: pointedVocalize,
    });
    expect(sent).toStrictEqual([POINTED]);
    const [name, meta] = rpcs[0];
    expect(name).toBe("attach_video_narration");
    expect(meta.text).toBe(PLAIN);
    expect(meta.alignment.characters.join("")).toBe(PLAIN);
    expect(run.output.audio_meta.nikud).toBe("added");
    // Billed on the pointed text it was sent, not the shorter plain script.
    expect(run.output.audio_meta.characters).toBe(POINTED.length);
    expect(result.costUsd).toBe(
      Math.round((POINTED.length / 1000) * 0.12 * 10000) / 10000,
    );
  });

  test("a first take's nikud and billed characters reach the finished run's output", async () => {
    stubElevenLabs([]);
    const { run, db, updates } = voiceFixture(
      { continuous: true, voice_id: "v1" },
      {},
      { restUpdate: true },
    );
    const result = await generateVoice({
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize: pointedVocalize,
    });
    expect(updates).toHaveLength(1);
    // What index.ts finishes the run with: the claimed run's output plus the handler's.
    const finished = { ...run.output, ...result.output };
    expect(finished.audio_path).toBe(updates[0].output.audio_path);
    expect(finished.audio_meta).toMatchObject({
      provider: "elevenlabs",
      nikud: "added",
      characters: POINTED.length,
      characters_basis: "sent_text",
    });
  });

  test("ElevenLabs' character-cost header is the billed count when it sends one", async () => {
    stubElevenLabs([], "61");
    const { run, db } = voiceFixture({ continuous: true, voice_id: "v1" });
    const result = await generateVoice({
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize: pointedVocalize,
    });
    expect(run.output.audio_meta.characters).toBe(61);
    expect(run.output.audio_meta.characters_basis).toBe(
      "character_cost_header",
    );
    expect(result.costUsd).toBe(0.0073);
  });

  test("a talking scene's own voice run is pointed and keyed back to its plain line", async () => {
    const sent = [];
    stubElevenLabs(sent);
    const { run, db, rpcs } = voiceFixture(
      { voice_id: "v1" },
      { lipsync: true },
    );
    await generateVoice({
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize: pointedVocalize,
    });
    expect(sent).toStrictEqual([POINTED]);
    const [name, meta] = rpcs[0];
    expect(name).toBe("attach_video_scene_asset");
    expect(meta.text).toBe(PLAIN);
    expect(meta.alignment.characters.join("")).toBe(PLAIN);
  });

  test("OpenRouter and Gemini hear the pointed script and record the nikud step", async () => {
    const sent = [];
    vi.stubGlobal("fetch", async (url, init) => {
      const body = JSON.parse(init.body);
      if (String(url).endsWith("/audio/speech")) {
        sent.push(["openrouter", body.input]);
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "audio/mpeg" },
        });
      }
      sent.push(["gemini", body.contents[0].parts[0].text]);
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: Buffer.from("RIFF0000WAVE").toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      });
    });
    const viaOpenRouter = voiceFixture({ continuous: true, voice_id: "v1" });
    await generateVoice({
      ...viaOpenRouter,
      apiKey: null,
      resolveOpenRouterKey: async () => "sk-or",
      log: () => {},
      vocalize: pointedVocalize,
    });
    expect(viaOpenRouter.run.output.audio_meta).toMatchObject({
      provider: "openrouter",
      nikud: "added",
    });
    const viaGemini = voiceFixture({ continuous: true, voice_id: "v1" });
    await generateVoice({
      ...viaGemini,
      apiKey: null,
      googleKey: "g",
      log: () => {},
      vocalize: pointedVocalize,
    });
    expect(viaGemini.run.output.audio_meta).toMatchObject({
      provider: "gemini",
      nikud: "added",
    });
    expect(sent[0]).toStrictEqual(["openrouter", POINTED]);
    expect(sent[1][0]).toBe("gemini");
    expect(sent[1][1]).toContain(POINTED);
  });

  test("the nikud call runs outside the submit guard and not at all for stored audio", async () => {
    stubElevenLabs([]);
    const { run, db } = voiceFixture({ continuous: true, voice_id: "v1" });
    let inside = false;
    const seen = [];
    const vocalize = vi.fn(async (text: string) => {
      seen.push(inside);
      return pointedVocalize(text);
    });
    const submitting = async (submit) => {
      inside = true;
      try {
        return await submit();
      } finally {
        inside = false;
      }
    };
    const voice = {
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize,
      submitting,
    };
    await generateVoice(voice);
    expect(seen).toStrictEqual([false]);
    // A retry reuses the stored audio and does not ask Dicta again.
    await generateVoice(voice);
    expect(vocalize).toHaveBeenCalledTimes(1);
  });
});
