import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  filmScriptOf,
  filmSeconds,
  maxWords,
  scriptLines,
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

Deno.test("a beat says at most 2.5 words a second", () => {
  assertStrictEquals(maxWords(2), 5);
  assertStrictEquals(maxWords(3), 7);
  assertStrictEquals(maxWords(0.2), 1);
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

Deno.test("the turn note says where the script stands", () => {
  assertMatch(scriptLines(withConcept("יום אחד"), 0)[0], /עוד אין/);
  const waiting = withScript(withConcept("יום אחד"), {
    artifact_id: "s",
    title: "",
    total_s: 3,
    beats,
    saved_turn: null,
  });
  assertMatch(scriptLines(waiting, 0)[0], /ממתין לאישור/);
  assertEquals(scriptLines(waiting, 2), []);
  assertEquals(
    scriptLines({ ...waiting, workshop_script: { skipped: true } }, 0),
    [],
  );
});
