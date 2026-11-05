import {
  assert,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ScriptBeat } from "../film-script.ts";
import { fillRefusal } from "./script-fill.ts";

/** Beats of `seconds` each, back to back, saying these lines. */
function beats(seconds: number, lines: Array<string>): Array<ScriptBeat> {
  return lines.map((narration, index) => ({
    start_s: Math.round(index * seconds * 10) / 10,
    end_s: Math.round((index + 1) * seconds * 10) / 10,
    narration,
    on_screen: "",
    visual: "motion graphics",
  }));
}

describe("fillRefusal", () => {
  it("beats filled to their most words are saved, though whole words leave time over", () => {
    // A 2.2-second beat holds 3 words (1.8 seconds with its end pause): 82% of its length.
    const full = beats(2.2, Array(6).fill("כרמן מנהלת שיווק."));
    assertStrictEquals(fillRefusal(full), null);
  });

  it("a word short in every beat is refused when it leaves the script under MIN_FILL", () => {
    // Five 3-second beats at 4 words, each a word under its 5: about 82% of what they hold.
    const close = beats(3, Array(5).fill("כרמן מנהלת את השיווק."));
    const refusal = fillRefusal(close) ?? "";
    assertStringIncludes(refusal, "הקריינות קצרה מדי");
    for (const line of [1, 2, 3, 4, 5]) {
      assertStringIncludes(refusal, `שורה ${line}: 4 מילים, ונכנסות עד 5`);
    }
  });

  it("a short narration is refused with only the words its beats can hold", () => {
    const short = beats(3, [
      "כרמן מנהלת את השיווק.",
      "ולעסק יש.",
      "כרמן מנהלת את השיווק.",
      "ולעסק יש.",
    ]);
    const refusal = fillRefusal(short) ?? "";
    assertStringIncludes(refusal, "הקריינות קצרה מדי");
    assertStringIncludes(refusal, "שורה 2: 2 מילים, ונכנסות עד 5");
    assertStringIncludes(refusal, "שורה 4: 2 מילים, ונכנסות עד 5");
    // A beat one word short has room too: every word that fits is listed.
    assertStringIncludes(refusal, "שורה 1: 4 מילים, ונכנסות עד 5");
    // Never an action the script cannot take: shorter beats or another line.
    assert(!refusal.includes("duration_s"), refusal);
  });
});
