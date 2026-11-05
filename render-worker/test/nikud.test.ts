import { describe, expect, test } from "vitest";
import { wordsFromAlignment } from "../src/compose/captions.ts";
import {
  isVocalized,
  mergeVocalized,
  sameWord,
  stripNikud,
} from "../src/jobs/nikud.ts";
import { spokenAlignment } from "../src/jobs/spoken-alignment.ts";

// Dicta's answer for these words: it writes בוקר without its mater (בֹּקֶר).
const PLAIN = "הקפה שלנו נקלה בכל בוקר.";
const POINTED = "הַקָּפֶה שֶׁלָּנוּ נְקַלָּה בְּכָל בֹּקֶר.";

/** Character timings as ElevenLabs returns them: one entry per character, 0.1 s each. */
const timed = (characters: Array<string>) => ({
  characters,
  character_start_times_seconds: characters.map((_, at) => at / 10),
  character_end_times_seconds: characters.map((_, at) => (at + 1) / 10),
});

describe("nikud text", () => {
  test("stripping the points gives back the plain script", () => {
    expect(stripNikud(POINTED)).toBe("הקפה שלנו נקלה בכל בקר.");
    expect(isVocalized(POINTED)).toBe(true);
    expect(isVocalized(PLAIN)).toBe(false);
  });

  test("a script counts as pointed only when every Hebrew word is", () => {
    expect(isVocalized("שֶׁלָּנוּ פה")).toBe(false);
    expect(isVocalized("שֶׁלָּנוּ פֹּה")).toBe(true);
    // Maqaf is punctuation, not a point.
    expect(isVocalized("א־ב־ג־ד")).toBe(false);
    expect(isVocalized("Hello AIOS")).toBe(false);
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

  test("a dropped mater is the same word; an added one is another word", () => {
    expect(sameWord("בוקר", "בֹּקֶר")).toBe(true);
    expect(sameWord("בת", "בַּיִת")).toBe(false);
    expect(mergeVocalized("בת ים", "בַּיִת יָם")).toBe("בת יָם");
    expect(sameWord("שלום", "שָׁלוֹם")).toBe(true);
    expect(sameWord("שלום", "שָׁלוֹמִי")).toBe(false);
  });

  test("whitespace comes from the script and a word Carmen pointed herself stays hers", () => {
    expect(mergeVocalized("שלום\n  אֶלֶף", "שָׁלוֹם אָלֶף")).toBe(
      "שָׁלוֹם\n  אֶלֶף",
    );
  });
});

describe("word timings", () => {
  test("the pointed take's timings come back keyed to the plain script", () => {
    const spoken = "בֹּקֶר טוֹב";
    const mapped = spokenAlignment(timed(spoken.split("")), spoken, "בוקר טוב");
    expect(mapped.characters.join("")).toBe("בוקר טוב");
    const words = wordsFromAlignment(mapped);
    expect(words.map((word) => word.text)).toStrictEqual(["בוקר", "טוב"]);
    expect(words[0].start).toBeCloseTo(0);
    expect(words[0].end).toBeCloseTo(0.6);
    expect(words[1].start).toBeCloseTo(0.7);
    expect(words[1].end).toBeCloseTo(1.1);
  });

  test("points the engine ordered differently still line up (NFC)", () => {
    // Shin dot before qamats in what was sent, qamats before shin dot in what was timed.
    const spoken = "שָׁלוֹם טוֹב";
    const engine = "שָׁלוֹם טוֹב";
    expect(engine).not.toBe(spoken);
    expect(engine.normalize("NFC")).toBe(spoken.normalize("NFC"));
    const mapped = spokenAlignment(timed(engine.split("")), spoken, "שלום טוב");
    expect(wordsFromAlignment(mapped).map((word) => word.text)).toStrictEqual([
      "שלום",
      "טוב",
    ]);
    expect(mapped.characters.join("")).toBe("שלום טוב");
  });

  test("timings that do not match the sent text still show the script's words", () => {
    // The engine timed other runs (an extra space), but the words still pair one to one.
    const engine = "בֹּקֶר  טוֹב";
    const mapped = spokenAlignment(
      timed(engine.split("")),
      "בֹּקֶר טוֹב",
      "בוקר טוב",
    );
    const words = wordsFromAlignment(mapped);
    expect(words.map((word) => word.text)).toStrictEqual(["בוקר", "טוב"]);
    expect(words[0].start).toBeCloseTo(0);
    expect(words[0].end).toBeCloseTo(0.6);
    expect(words[1].start).toBeCloseTo(0.8);
    expect(words[1].end).toBeCloseTo(1.2);
  });

  test("timings whose words do not pair up lose their points instead", () => {
    const mapped = spokenAlignment(
      timed("שָׁלוֹם".split("")),
      "שָׁלוֹם עוֹלָם",
      "שלום עולם",
    );
    expect(mapped.characters.join("")).toBe("שלום");
    expect(mapped.character_end_times_seconds.at(-1)).toBeCloseTo(0.7);
  });
});
