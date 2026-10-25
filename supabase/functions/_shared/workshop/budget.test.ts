import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvalCode,
  budgetOf,
  checkBudget,
  requestBudget,
  spendBudget,
  suggestCap,
  type Quote,
} from "./budget.ts";

const film: Quote = {
  tool: "workshop_produce_video",
  engine: "higgsfield",
  count: 5,
  usd: 2.5,
};

const yes = `מאשר תקציב ${approvalCode("tok")}`;

test("a project without a budget stops and asks for one", () => {
  assert.deepEqual(checkBudget({}, film, { turnId: "turn-1" }), {
    ok: false,
    reason: "no_budget",
  });
});

test("the user's tap in the next turn approves the budget and the step runs", () => {
  const { payload } = requestBudget({}, 10, "turn-1", "tok");
  const check = checkBudget(payload, film, {
    token: "tok",
    turnId: "turn-2",
    userText: yes,
  });
  assert.equal(check.ok, true);
  if (!check.ok) return;
  const budget = budgetOf(check.payload);
  assert.equal(budget.cap_usd, 10);
  assert.equal(budget.request, undefined);
});

test("a step that fits in what is left runs without asking", () => {
  const approved = { workshop_budget: { cap_usd: 10, spent_usd: 4 } };
  const check = checkBudget(approved, film, { turnId: "turn-9" });
  assert.equal(check.ok, true);
});

test("a step over what is left stops with over_budget", () => {
  const approved = { workshop_budget: { cap_usd: 10, spent_usd: 9 } };
  assert.deepEqual(checkBudget(approved, film, { turnId: "turn-9" }), {
    ok: false,
    reason: "over_budget",
  });
});

test("only the user's own message approves: same turn, no code, or late is refused", () => {
  const asked = new Date("2026-10-25T10:00:00Z");
  const { payload } = requestBudget({}, 10, "turn-1", "tok", asked);
  const at = new Date("2026-10-25T10:05:00Z");
  assert.deepEqual(
    checkBudget(
      payload,
      film,
      { token: "tok", turnId: "turn-1", userText: yes },
      at,
    ),
    { ok: false, reason: "same_turn" },
  );
  assert.deepEqual(
    checkBudget(
      payload,
      film,
      { token: "tok", turnId: "turn-2", userText: "תסתכלי על האתר" },
      at,
    ),
    { ok: false, reason: "not_user" },
  );
  assert.deepEqual(
    checkBudget(
      payload,
      film,
      { token: "tok", turnId: "turn-2", userText: yes },
      new Date("2026-10-25T10:31:00Z"),
    ),
    { ok: false, reason: "expired" },
  );
});

test("free steps and queue approvals do not need the budget", () => {
  assert.equal(
    checkBudget({}, { ...film, engine: "mock", usd: 0 }, {}).ok,
    true,
  );
  assert.equal(checkBudget({}, film, { approvedOutOfBand: true }).ok, true);
});

test("spending adds the step's units at the price it was checked at", () => {
  const approved = { workshop_budget: { cap_usd: 10, spent_usd: 1 } };
  const check = checkBudget(approved, film, { turnId: "turn-9" });
  assert.equal(check.ok, true);
  if (!check.ok) return;
  const after = spendBudget(check.payload, film.tool, 5);
  assert.equal(budgetOf(after).spent_usd, 3.5);
});

test("the proposed budget covers the step with room, or the user's own number", () => {
  const budget = budgetOf({ workshop_budget: { cap_usd: 0, spent_usd: 0 } });
  assert.equal(suggestCap(budget, film), 4);
  assert.equal(suggestCap(budget, film, 20), 20);
  assert.equal(suggestCap(budget, film, 1), 4);
});

test("the user's code approves even when Carmen does not repeat the token", () => {
  const { payload } = requestBudget({}, 10, "turn-1", "tok");
  const check = checkBudget(payload, film, {
    turnId: "turn-2",
    userText: yes,
  });
  assert.equal(check.ok, true);
});
