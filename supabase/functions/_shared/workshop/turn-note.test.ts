import assert from "node:assert/strict";
import { test } from "node:test";
import { approveFromMessage } from "./budget-approve.ts";
import { budgetOf, requestBudget } from "./budget.ts";
import { nextFilmStep } from "./turn-note.ts";

test("the next film step follows the project, so the storyboard is not rewritten", () => {
  const base = {
    scenes: 5,
    withStill: 5,
    narrated: true,
    voiceChosen: true,
    producing: false,
  };
  assert.match(
    nextFilmStep({ ...base, scenes: 0, withStill: 0 }),
    /storyboard/,
  );
  assert.match(nextFilmStep({ ...base, withStill: 2 }), /make_stills/);
  assert.match(nextFilmStep({ ...base, voiceChosen: false }), /choose_voice/);
  assert.match(nextFilmStep(base), /produce_video/);
  assert.match(nextFilmStep({ ...base, producing: true }), /get_state/);
});

test("the user's code approves the waiting budget at the start of the turn", () => {
  const asked = requestBudget(
    {},
    4,
    "turn-1",
    "tok-22b8",
    new Date("2026-10-25T14:00:00Z"),
    "workshop_make_stills",
  );
  const code = asked.request.code;
  const at = new Date("2026-10-25T14:05:00Z");
  assert.equal(approveFromMessage(asked.payload, "יעל", at), null);
  const approved = approveFromMessage(asked.payload, `מאשר תקציב ${code}`, at);
  assert.ok(approved);
  assert.equal(approved.tool, "workshop_make_stills");
  assert.equal(budgetOf(approved.payload).cap_usd, 4);
  assert.equal(budgetOf(approved.payload).request, undefined);
  assert.equal(
    approveFromMessage(
      asked.payload,
      `מאשר תקציב ${code}`,
      new Date("2026-10-25T14:40:00Z"),
    ),
    null,
  );
});
