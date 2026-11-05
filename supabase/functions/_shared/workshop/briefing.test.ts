import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { briefingGate, type BriefingInput } from "./briefing.ts";

/** A film with nothing briefed yet, never shown the questions. */
const unbriefed = (over: Partial<BriefingInput> = {}): BriefingInput => ({
  look: { bible: "", references: [], film: "" },
  styleApproved: false,
  connected: null,
  engine: null,
  kind: "video",
  needsEngine: false,
  answers: {},
  ...over,
});

Deno.test("automatic mode never asks the user the brief questions", () => {
  const gate = briefingGate(unbriefed({ auto: true, read: true }));
  assert(gate);
  assertStrictEquals(gate.say_to_user, "");
  assertStrictEquals(gate.carmen_continues, true);
  assertEquals(gate.missing, ["style", "film"]);
  assertMatch(gate.carmen_next, /מצב אוטומטי/);
  assertMatch(gate.carmen_next, /style_bible/);
});

Deno.test(
  "automatic mode passes once Carmen wrote the style and film brief",
  () => {
    const gate = briefingGate(
      unbriefed({
        auto: true,
        styleApproved: true,
        look: { bible: "warm editorial", references: [], film: "calm, 15s" },
      }),
    );
    assertStrictEquals(gate, null);
    // Semi-automatic: what Carmen wrote alone does not count before the user saw the questions.
    const semi = briefingGate(
      unbriefed({
        read: true,
        styleApproved: true,
        look: { bible: "warm editorial", references: [], film: "calm, 15s" },
      }),
    );
    assert(semi);
    assertMatch(semi.say_to_user, /\[\[בחירה:/);
  },
);
