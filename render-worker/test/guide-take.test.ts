import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  SPEECH_TO_SPEECH_USD_PER_MINUTE,
  guideCostUsd,
} from "../src/jobs/guide-take.ts";
import { generateVoice } from "../src/jobs/sound.ts";

afterEach(() => vi.unstubAllGlobals());

const SCRIPT = "קופי, מדיה. כרמן מנהלת.";
const GUIDE = "t1/c1/item1/narration/guide-1700000000000.webm";
/** Two seconds of the 128 kbps MP3 speech to speech returns. */
const TAKE = new Uint8Array(32_000).fill(7);

/** A continuous voice run with the user's recording; records what the run stores. */
function guideRun(input: Record<string, unknown> = {}) {
  const run = {
    id: "run1",
    tenant_id: "t1",
    item_id: "item1",
    scene_id: null,
    input: {
      continuous: true,
      voice_id: "v1",
      guide_audio: { bucket: "creative-video", path: GUIDE },
      ...input,
    },
    output: {} as Record<string, unknown>,
  };
  const rpcs: Array<[string, Record<string, unknown>]> = [];
  const downloads: Array<string> = [];
  const uploads: Array<string> = [];
  const db = {
    async select(table: string) {
      return table === "marketing_work_items"
        ? [{ id: "item1", tenant_id: "t1", client_id: "c1" }]
        : [{ id: "s1", voiceover_text: SCRIPT, meta: {} }];
    },
    async download(bucket: string, path: string) {
      downloads.push(`${bucket}/${path}`);
      return new Uint8Array([1, 2, 3]);
    },
    async upload(bucket: string, path: string) {
      uploads.push(`${bucket}/${path}`);
    },
    async update(_table: string, _filter: string, patch) {
      run.output = patch.output;
    },
    async rpc(name: string, args) {
      rpcs.push([name, args.p_meta]);
    },
  };
  return { run, db, rpcs, downloads, uploads };
}

/** ElevenLabs: speech to speech returns TAKE; forced alignment times each character it is sent. */
function stubElevenLabs(calls: Array<string>, aligner: "ok" | "fails" = "ok") {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push(String(url));
    const form = init.body as FormData;
    if (String(url).includes("/v1/speech-to-speech/")) {
      expect(form.get("model_id")).toBe("eleven_multilingual_sts_v2");
      expect(form.get("remove_background_noise")).toBe("true");
      expect((form.get("audio") as Blob).type).toBe("audio/webm");
      return new Response(TAKE);
    }
    if (aligner === "fails") {
      return Response.json({ detail: "busy" }, { status: 500 });
    }
    const text = String(form.get("text"));
    return Response.json({
      characters: text.split("").map((char, at) => ({
        text: char,
        start: at / 10,
        end: (at + 1) / 10,
      })),
      words: [],
      loss: 0.1,
    });
  });
}

const voice = (fixture: ReturnType<typeof guideRun>, apiKey = "eleven") =>
  generateVoice({
    db: fixture.db,
    run: fixture.run,
    apiKey,
    googleKey: "google",
    resolveOpenRouterKey: async () => "openrouter",
    vocalize: async () => {
      throw new Error("a recording is not pointed");
    },
    log: () => {},
    submitting: (work) => work(),
  });

describe("the narration from the user's recording", () => {
  test("is voiced in the run's voice, timed against the script and priced by its length", async () => {
    const calls: Array<string> = [];
    stubElevenLabs(calls);
    const fixture = guideRun();
    const result = await voice(fixture);
    expect(calls[0]).toBe(
      "https://api.elevenlabs.io/v1/speech-to-speech/v1?output_format=mp3_44100_128",
    );
    expect(calls[1]).toBe("https://api.elevenlabs.io/v1/forced-alignment");
    expect(fixture.downloads).toStrictEqual([`creative-video/${GUIDE}`]);
    const [name, meta] = fixture.rpcs[0];
    expect(name).toBe("attach_video_narration");
    expect(meta).toMatchObject({
      provider: "elevenlabs",
      voice_id: "v1",
      text: SCRIPT,
      source: "guide",
      guide: { bucket: "creative-video", path: GUIDE },
      pronunciations: {},
    });
    const alignment = meta.alignment as { characters: Array<string> };
    expect(alignment.characters.join("")).toBe(SCRIPT);
    expect(result.output.audio_meta.seconds).toBe(2);
    expect(result.costUsd).toBe(guideCostUsd(2));
    expect(result.costUsd).toBe(0.004);
  });

  test("a failed alignment keeps the paid take, without timings", async () => {
    stubElevenLabs([], "fails");
    const fixture = guideRun();
    await voice(fixture);
    const meta = fixture.rpcs[0][1];
    expect(meta.alignment).toBeNull();
    expect(fixture.uploads).toHaveLength(1);
  });

  test("without ElevenLabs it fails with the reason, and no other engine is tried", async () => {
    const calls: Array<string> = [];
    stubElevenLabs(calls);
    await expect(voice(guideRun(), "")).rejects.toMatchObject({
      final: true,
      message: expect.stringContaining("ElevenLabs"),
    });
    expect(calls).toHaveLength(0);
    vi.stubGlobal("fetch", async () =>
      Response.json({ detail: "invalid_api_key" }, { status: 401 }),
    );
    await expect(voice(guideRun())).rejects.toMatchObject({
      final: true,
      message: expect.stringContaining("Voice Changer"),
    });
  });

  test("a recording outside the project's narration folder is refused", async () => {
    stubElevenLabs([]);
    for (const path of [
      "t2/c1/item1/narration/guide-1.webm",
      "t1/c1/item2/narration/guide-1.webm",
      "t1/c1/item1/reference/guide-1.webm",
    ]) {
      await expect(
        voice(guideRun({ guide_audio: { bucket: "creative-video", path } })),
      ).rejects.toThrow();
    }
  });

  test("the quote prices it at the same rate", () => {
    const prices = readFileSync(
      new URL(
        "../../supabase/functions/_shared/workshop/clip-prices.ts",
        import.meta.url,
      ),
      "utf8",
    );
    const rate = Number(
      /export const SPEECH_TO_SPEECH_USD_PER_MINUTE = ([0-9.]+);/.exec(
        prices,
      )?.[1],
    );
    expect(rate).toBe(SPEECH_TO_SPEECH_USD_PER_MINUTE);
  });
});
