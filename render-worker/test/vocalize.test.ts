import { afterEach, describe, expect, test, vi } from "vitest";
import { wordsFromAlignment } from "../src/compose/captions.ts";
import { generateVoice } from "../src/jobs/sound.ts";
import {
  isVocalized,
  mergeVocalized,
  spokenAlignment,
  stripNikud,
} from "../src/jobs/nikud.ts";
import { vocalizeForSpeech } from "../src/jobs/vocalize.ts";
import { nakdanBody, nakdanVocalizer } from "../src/providers/nakdan.ts";

// Dicta's answer for these words: it writes בוקר and היי without their matres (בֹּקֶר, הַי).
const PLAIN = "הקפה שלנו נקלה בכל בוקר.";
const POINTED = "הַקָּפֶה שֶׁלָּנוּ נְקַלָּה בְּכָל בֹּקֶר.";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Character timings as ElevenLabs returns them: one entry per character, 0.1 s each. */
const timed = (text: string) => {
  const characters = text.split("");
  return {
    characters,
    character_start_times_seconds: characters.map((_, at) => at / 10),
    character_end_times_seconds: characters.map((_, at) => (at + 1) / 10),
  };
};

describe("nikud text", () => {
  test("stripping the points gives back the plain script", () => {
    expect(stripNikud(POINTED)).toBe("הקפה שלנו נקלה בכל בקר.");
    expect(isVocalized(POINTED)).toBe(true);
    expect(isVocalized(PLAIN)).toBe(false);
  });

  test("a word whose letters changed beyond its matres keeps the script's spelling", () => {
    expect(mergeVocalized(PLAIN, POINTED)).toBe(POINTED);
    expect(mergeVocalized("שלום לכולם", "שָׁלוֹם לְכֻלָּם")).toBe(
      "שָׁלוֹם לְכֻלָּם",
    );
    // Another word, other punctuation: the script's own word is spoken.
    expect(mergeVocalized("שלום עולם!", "שָׁלוֹם עוֹלָמוֹת.")).toBe(
      "שָׁלוֹם עולם!",
    );
    expect(mergeVocalized("שלום עולם", "שָׁלוֹם")).toBeNull();
  });

  test("whitespace comes from the script and a word Carmen pointed herself stays hers", () => {
    expect(mergeVocalized("שלום\n  אֶלֶף", "שָׁלוֹם אָלֶף")).toBe(
      "שָׁלוֹם\n  אֶלֶף",
    );
  });
});

describe("vocalizeForSpeech", () => {
  test("adds nikud to a plain Hebrew script", async () => {
    const vocalizer = vi.fn(async () => POINTED);
    expect(await vocalizeForSpeech(PLAIN, { vocalizer })).toStrictEqual({
      text: POINTED,
      nikud: "added",
    });
  });

  test("passes non-Hebrew and already pointed scripts through without a call", async () => {
    const vocalizer = vi.fn(async () => "x");
    expect(await vocalizeForSpeech("Hello AIOS", { vocalizer })).toStrictEqual({
      text: "Hello AIOS",
      nikud: "not_hebrew",
    });
    expect(await vocalizeForSpeech(POINTED, { vocalizer })).toStrictEqual({
      text: POINTED,
      nikud: "already",
    });
    expect(vocalizer).not.toHaveBeenCalled();
  });

  test("speaks the script as written when the vocalizer fails or answers another text", async () => {
    const log = vi.fn();
    const failing = async () => {
      throw new Error("nakdan 503");
    };
    expect(
      await vocalizeForSpeech("מה שלומכם היום", { vocalizer: failing, log }),
    ).toStrictEqual({ text: "מה שלומכם היום", nikud: "failed" });
    expect(log.mock.calls[0][0]).toContain("nakdan 503");
    const rewritten = async () => "משהו אחר לגמרי ושונה";
    expect(
      await vocalizeForSpeech("ערב טוב לכולם", { vocalizer: rewritten, log }),
    ).toStrictEqual({ text: "ערב טוב לכולם", nikud: "failed" });
  });

  test("NIKUD_DICTA_URL=off turns the step off", async () => {
    vi.stubEnv("NIKUD_DICTA_URL", "off");
    expect(nakdanVocalizer()).toBeNull();
    expect(await vocalizeForSpeech("לילה טוב")).toStrictEqual({
      text: "לילה טוב",
      nikud: "off",
    });
  });
});

describe("Dicta Nakdan", () => {
  test("joins each word's best reading and drops Dicta's prefix marks", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        { word: "הקפה", sep: false, options: ["הַקָּפֶה", "הַקֹּפֶה"] },
        { word: " ", sep: true, options: [] },
        { word: "שלנו", sep: false, options: ["שֶׁ|לָּנוּ"] },
        { word: " ", sep: true, options: [] },
        { word: "AIOS", sep: false, options: [] },
      ]),
    );
    const vocalizer = nakdanVocalizer(fetchImpl);
    expect(await vocalizer("הקפה שלנו AIOS")).toBe("הַקָּפֶה שֶׁלָּנוּ AIOS");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body))).toStrictEqual(
      nakdanBody("הקפה שלנו AIOS"),
    );
  });

  test("an error status throws, so the script is spoken as written", async () => {
    const vocalizer = nakdanVocalizer(
      async () => new Response("", { status: 502 }),
    );
    await expect(vocalizer("שלום")).rejects.toThrow("nakdan 502");
  });
});

describe("word timings", () => {
  test("the pointed take's timings come back keyed to the plain script", () => {
    const spoken = "בֹּקֶר טוֹב";
    const mapped = spokenAlignment(timed(spoken), spoken, "בוקר טוב");
    expect(mapped.characters.join("")).toBe("בוקר טוב");
    const words = wordsFromAlignment(mapped);
    expect(words.map((word) => word.text)).toStrictEqual(["בוקר", "טוב"]);
    expect(words[0].start).toBeCloseTo(0);
    expect(words[0].end).toBeCloseTo(0.6);
    expect(words[1].start).toBeCloseTo(0.7);
    expect(words[1].end).toBeCloseTo(1.1);
  });

  test("timings that do not line up lose their points instead", () => {
    const mapped = spokenAlignment(
      timed("שָׁלוֹם"),
      "שָׁלוֹם עוֹלָם",
      "שלום עולם",
    );
    expect(mapped.characters.join("")).toBe("שלום");
    expect(mapped.character_end_times_seconds.at(-1)).toBeCloseTo(0.7);
  });
});

describe("the voice run", () => {
  test("ElevenLabs hears the pointed script; the stored script and its timings stay plain", async () => {
    const sent = [];
    vi.stubGlobal("fetch", async (_url, init) => {
      const { text } = JSON.parse(init.body);
      sent.push(text);
      return Response.json({ audio_base64: "AQID", alignment: timed(text) });
    });
    const run = {
      id: "run1",
      tenant_id: "t1",
      item_id: "item1",
      scene_id: null,
      input: { continuous: true, voice_id: "v1" },
      output: {},
    };
    const rpcs = [];
    const db = {
      async select(table) {
        if (table === "marketing_work_items") {
          return [{ id: "item1", tenant_id: "t1", client_id: "c1" }];
        }
        return [{ id: "s1", voiceover_text: PLAIN, meta: {} }];
      },
      async upload() {},
      async update(_table, _filter, patch) {
        run.output = patch.output;
      },
      async rpc(name, args) {
        rpcs.push([name, args.p_meta]);
      },
    };
    await generateVoice({
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize: (text) =>
        vocalizeForSpeech(text, { vocalizer: async () => POINTED }),
    });
    expect(sent).toStrictEqual([POINTED]);
    const [name, meta] = rpcs[0];
    expect(name).toBe("attach_video_narration");
    expect(meta.text).toBe(PLAIN);
    expect(meta.alignment.characters.join("")).toBe(PLAIN);
    expect(run.output.audio_meta.nikud).toBe("added");
  });
});
