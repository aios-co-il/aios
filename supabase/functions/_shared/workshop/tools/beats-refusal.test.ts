import { assertStrictEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ScriptBeat } from "../film-script.ts";
import { PACE_GUIDE } from "../script-pace.ts";
import { beatsRefusal } from "./beats-refusal.ts";

/** Back-to-back beats of these lengths saying these lines. */
function beats(lines: Array<[number, string]>): Array<ScriptBeat> {
  let start = 0;
  return lines.map(([seconds, narration]) => {
    const beat = {
      start_s: start,
      end_s: Math.round((start + seconds) * 10) / 10,
      narration,
      on_screen: "",
      visual: "motion graphics",
    };
    start = beat.end_s;
    return beat;
  });
}

describe("beatsRefusal", () => {
  it("refuses an empty script and a beat under half a second", () => {
    assertStringIncludes(beatsRefusal([], null) ?? "", "beats ריק");
    assertStringIncludes(
      beatsRefusal(beats([[0.4, "כרמן."]]), null) ?? "",
      "שורה 1: duration_s חייב להיות לפחות 0.5 שניות.",
    );
  });

  it("lists every line the voice cannot say in its beat, with the pace guide", () => {
    const refusal =
      beatsRefusal(
        beats([[2.5, "כרמן מנהלת את כל השיווק של העסק שלכם כל יום"]]),
        null,
      ) ?? "";
    assertStringIncludes(refusal, "הקריינות ארוכה מהזמן של השורה");
    assertStringIncludes(refusal, PACE_GUIDE);
  });

  it("refuses beats that do not add up to the film's length", () => {
    const refusal =
      beatsRefusal(beats([[3, "כרמן מנהלת את השיווק."]]), 15) ?? "";
    assertStringIncludes(refusal, "סכום השורות 3 שניות, והסרט 15 שניות");
  });

  it("saves beats that fit the film and fill their time", () => {
    const full = beats([
      [3, "קמפיין הוא רק מהלך אחד."],
      [3, "ולעסק שלכם יש חמישה תחומים."],
    ]);
    assertStrictEquals(beatsRefusal(full, 6), null);
  });
});
