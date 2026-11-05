import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearVocalizedCache,
  vocalizeForSpeech,
} from "../src/jobs/vocalize.ts";
import { nakdanVocalizer } from "../src/providers/nakdan.ts";

// Dicta's answer for these words: it writes בוקר without its mater (בֹּקֶר).
const PLAIN = "הקפה שלנו נקלה בכל בוקר.";
const POINTED = "הַקָּפֶה שֶׁלָּנוּ נְקַלָּה בְּכָל בֹּקֶר.";

beforeEach(() => clearVocalizedCache());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("vocalizeForSpeech", () => {
  test("adds nikud to a plain Hebrew script and asks once per script", async () => {
    const vocalizer = vi.fn(async () => POINTED);
    expect(await vocalizeForSpeech(PLAIN, { vocalizer })).toStrictEqual({
      text: POINTED,
      nikud: "added",
    });
    await vocalizeForSpeech(PLAIN, { vocalizer });
    expect(vocalizer).toHaveBeenCalledTimes(1);
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

  test("a partly pointed script asks for its plain words and keeps the ones it pointed", async () => {
    // Dicta points every word it is sent; the script's own שֶׁלָּנוּ stays, its plain פה is taken.
    const vocalizer = vi.fn(async () => "שֶׁלָנוּ פֹּה");
    expect(
      await vocalizeForSpeech("שֶׁלָּנוּ פה", { vocalizer }),
    ).toStrictEqual({ text: "שֶׁלָּנוּ פֹּה", nikud: "added" });
    expect(vocalizer).toHaveBeenCalledWith("שלנו פה");
  });

  test("an answer that points none of the plain words speaks the script as written", async () => {
    const log = vi.fn();
    expect(
      await vocalizeForSpeech("ערב טוב", {
        vocalizer: async () => "ערב טוב",
        log,
      }),
    ).toStrictEqual({ text: "ערב טוב", nikud: "failed" });
  });

  test("speaks the script as written when the vocalizer fails or answers another text", async () => {
    const log = vi.fn();
    const failing = async () => {
      throw new Error("nakdan 503");
    };
    expect(
      await vocalizeForSpeech(PLAIN, { vocalizer: failing, log }),
    ).toStrictEqual({ text: PLAIN, nikud: "failed" });
    expect(log.mock.calls[0][0]).toContain("nakdan 503");
    const rewritten = async () => "משהו אחר לגמרי ושונה";
    expect(
      await vocalizeForSpeech("ערב טוב לכולם", { vocalizer: rewritten, log }),
    ).toStrictEqual({ text: "ערב טוב לכולם", nikud: "failed" });
  });

  test("a Dicta call that times out speaks the script as written", async () => {
    vi.stubEnv("NIKUD_TIMEOUT_MS", "20");
    const log = vi.fn();
    const vocalizer = nakdanVocalizer(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(init.signal.reason),
          );
        }),
    );
    expect(await vocalizeForSpeech(PLAIN, { vocalizer, log })).toStrictEqual({
      text: PLAIN,
      nikud: "failed",
    });
    expect(log.mock.calls[0][0]).toMatch(/vocalizer failed/);
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
