import { afterEach, describe, expect, test, vi } from "vitest";
import {
  applyPronunciations,
  loadPronunciations,
} from "../src/jobs/pronunciations.ts";
import { generateVoice } from "../src/jobs/sound.ts";
import { vocalizeForSpeech } from "../src/jobs/vocalize.ts";

const SAID = { מכירות: "מְכִירוֹת", כרמן: "קַרְמֶן" };

afterEach(() => vi.unstubAllGlobals());

describe("applyPronunciations", () => {
  test("says a named word its way and keeps the punctuation and spacing", () => {
    const out = applyPronunciations("קופי, מדיה, מכירות. כרמן  מנהלת", SAID);
    expect(out.text).toBe("קופי, מדיה, מְכִירוֹת. קַרְמֶן  מנהלת");
    expect(out.used).toStrictEqual(SAID);
  });

  test("matches after prefix letters and in a pointed script word", () => {
    expect(applyPronunciations("והמכירות שלנו", SAID).text).toBe(
      "והמְכִירוֹת שלנו",
    );
    expect(applyPronunciations("כַּרְמֵן כאן", SAID).text).toBe("קַרְמֶן כאן");
  });

  test("matches a one-letter word, alone or after a prefix letter", () => {
    const letter = { ש: "שִׁין" };
    expect(applyPronunciations("ש, וש.", letter).text).toBe("שִׁין, ושִׁין.");
    // Prefix letters alone never strip down to an empty word.
    expect(applyPronunciations("ו", { ו: "וָו" }).text).toBe("וָו");
  });

  test("leaves other words alone, also ones that only contain a named word", () => {
    const out = applyPronunciations("כרמנית מכירותיים", SAID);
    expect(out.text).toBe("כרמנית מכירותיים");
    expect(out.used).toStrictEqual({});
  });

  test("keeps the word count, so the timings line up with the script", () => {
    const script = "מכירות ודאטה, שמחברת הכול.";
    const out = applyPronunciations(script, SAID);
    expect(out.text.split(/\s+/)).toHaveLength(script.split(/\s+/).length);
  });
});

describe("loadPronunciations", () => {
  test("reads the run's tenant and keys the words without nikud", async () => {
    const queries: Array<string> = [];
    const map = await loadPronunciations(
      {
        async select(table: string, query: string) {
          queries.push(`${table}?${query}`);
          return [
            { word: "מְכִירוֹת", spoken: "מְכִירוֹת" },
            { word: "שתי", spoken: "שתי מילים" },
          ];
        },
      },
      "t1",
    );
    expect(queries[0]).toContain("workshop_pronunciations?tenant_id=eq.t1");
    // A spoken form of two words would break the word timings: skipped.
    expect(map).toStrictEqual({ מכירות: "מְכִירוֹת" });
  });

  test("a failed read speaks without them", async () => {
    const lines: Array<string> = [];
    const map = await loadPronunciations(
      {
        async select() {
          throw new Error("down");
        },
      },
      "t1",
      (line) => lines.push(line),
    );
    expect(map).toStrictEqual({});
    expect(lines[0]).toContain("down");
  });
});

describe("the voice run with pronunciations", () => {
  test("the engine hears the pronunciation over Dicta's nikud; the take records it", async () => {
    const sent: Array<string> = [];
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { text } = JSON.parse(init.body);
      sent.push(text);
      return Response.json({ audio_base64: "AQID", alignment: null });
    });
    const rpcs: Array<[string, Record<string, unknown>]> = [];
    const run = {
      id: "run1",
      tenant_id: "t1",
      item_id: "item1",
      scene_id: null,
      input: { continuous: true, voice_id: "v1" },
      output: {},
    };
    const db = {
      async select(table: string) {
        if (table === "marketing_work_items") {
          return [{ id: "item1", tenant_id: "t1", client_id: "c1" }];
        }
        if (table === "workshop_pronunciations") {
          return [{ word: "מכירות", spoken: "מְכִירוֹת" }];
        }
        return [{ id: "s1", voiceover_text: "מדיה מכירות", meta: {} }];
      },
      async upload() {},
      async update(_t: string, _f: string, patch: { output: object }) {
        run.output = patch.output;
      },
      async rpc(name: string, args: { p_meta: Record<string, unknown> }) {
        rpcs.push([name, args.p_meta]);
      },
    };
    // Dicta would point מכירות as מְחִירוֹת; the tenant's pronunciation is kept instead.
    await generateVoice({
      db,
      run,
      apiKey: "eleven",
      log: () => {},
      vocalize: (text: string) =>
        vocalizeForSpeech(text, { vocalizer: async () => "מֶדְיָה מְחִירוֹת" }),
    });
    expect(sent).toStrictEqual(["מֶדְיָה מְכִירוֹת"]);
    expect(rpcs[0][1].text).toBe("מדיה מכירות");
    expect(rpcs[0][1].pronunciations).toStrictEqual({ מכירות: "מְכִירוֹת" });
  });
});
