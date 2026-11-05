import { assertStrictEquals } from "jsr:@std/assert@1";
import { briefAnswersOf, withBriefAnswers } from "./brief-answers.ts";
import {
  conceptAnswer,
  filmScriptOf,
  filmSeconds,
  scriptSettled,
  withScript,
} from "./film-script.ts";

const beats = [
  { start_s: 0, end_s: 3, narration: "שלום", on_screen: "", visual: "" },
];
const withConcept = (concept: string, over = {}) => ({
  project_type: "video",
  workshop_brief: { answers: { קונספט: concept } },
  ...over,
});

Deno.test("the film's length comes from the brief, then the plan", () => {
  const brief = (answer: string) => ({
    workshop_brief: { answers: { אורך: answer } },
  });
  assertStrictEquals(filmSeconds(brief("15 שניות, 2.5 שניות לסצנה")), 15);
  assertStrictEquals(filmSeconds(brief("חצי דקה")), 30);
  assertStrictEquals(filmSeconds(brief("דקה")), 60);
  assertStrictEquals(
    filmSeconds({ workshop: { film: { totalSeconds: 20 } } }),
    20,
  );
  assertStrictEquals(filmSeconds({}), null);
});

Deno.test("a script belongs to the concept it was written for", () => {
  const saved = withScript(withConcept("יום אחד"), {
    artifact_id: "script-1",
    title: "יום אחד",
    total_s: 3,
    beats,
    saved_turn: "turn-1",
  });
  const script = filmScriptOf(saved);
  assertStrictEquals(
    script && "concept" in script && script.concept,
    "יום אחד",
  );
  assertStrictEquals(scriptSettled(saved), false);
  // Another concept chosen since: the script no longer counts, approved or not.
  const moved = {
    ...saved,
    workshop_brief: { answers: { קונספט: "לילה" } },
    workshop_script: { ...saved.workshop_script, approved: true },
  };
  assertStrictEquals(filmScriptOf(moved), null);
  assertStrictEquals(scriptSettled(moved), false);
});

Deno.test(
  "a concept chosen again under the first label is the concept, not an older one",
  () => {
    // Review of 5 Nov: the corrected answer stayed in its old place, and the newest-first read
    // found the concept answered under another label in between.
    const first = withBriefAnswers(
      {},
      { קונספט: "יום אחד", "בחירת קונספט": "לילה" },
    );
    const corrected = withBriefAnswers(first, { קונספט: "כוכבים" });
    assertStrictEquals(conceptAnswer(briefAnswersOf(corrected)), "כוכבים");
  },
);
