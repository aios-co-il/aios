import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  approvalCode,
  approvesRequest,
  budgetOf,
  budgetPrompt,
  checkBudget,
  refundBudget,
  requestBudget,
  settleProduction,
  spendBudget,
  suggestCap,
} from "./budget.ts";
import type { Quote } from "./budget-types.ts";

const film: Quote = {
  tool: "workshop_produce_video",
  engine: "higgsfield",
  count: 5,
  usd: 2.5,
};

const yes = `מאשר תקציב ${approvalCode("tok")}`;

Deno.test("a project without a budget stops and asks for one", () => {
  assertEquals(checkBudget({}, film, { turnId: "turn-1" }), {
    ok: false,
    reason: "no_budget",
  });
});

Deno.test(
  "the user's tap in the next turn approves the budget and the step runs",
  () => {
    const { payload } = requestBudget({}, 10, "turn-1", "tok");
    const check = checkBudget(payload, film, {
      token: "tok",
      turnId: "turn-2",
      userText: yes,
    });
    assertStrictEquals(check.ok, true);
    if (!check.ok) return;
    const budget = budgetOf(check.payload);
    assertStrictEquals(budget.cap_usd, 10);
    assertStrictEquals(budget.request, undefined);
  },
);

Deno.test("a step that fits in what is left runs without asking", () => {
  const approved = { workshop_budget: { cap_usd: 10, spent_usd: 4 } };
  const check = checkBudget(approved, film, { turnId: "turn-9" });
  assertStrictEquals(check.ok, true);
});

Deno.test("a step over what is left stops with over_budget", () => {
  const approved = { workshop_budget: { cap_usd: 10, spent_usd: 9 } };
  assertEquals(checkBudget(approved, film, { turnId: "turn-9" }), {
    ok: false,
    reason: "over_budget",
  });
});

Deno.test(
  "only the user's own message approves: same turn, no code, or late is refused",
  () => {
    const asked = new Date("2026-10-25T10:00:00Z");
    const { payload } = requestBudget({}, 10, "turn-1", "tok", asked);
    const at = new Date("2026-10-25T10:05:00Z");
    assertEquals(
      checkBudget(
        payload,
        film,
        { token: "tok", turnId: "turn-1", userText: yes },
        at,
      ),
      { ok: false, reason: "same_turn" },
    );
    assertEquals(
      checkBudget(
        payload,
        film,
        { token: "tok", turnId: "turn-2", userText: "תסתכלי על האתר" },
        at,
      ),
      { ok: false, reason: "not_user" },
    );
    assertEquals(
      checkBudget(
        payload,
        film,
        { token: "tok", turnId: "turn-2", userText: yes },
        new Date("2026-10-25T10:31:00Z"),
      ),
      { ok: false, reason: "expired" },
    );
  },
);

Deno.test("free steps and queue approvals do not need the budget", () => {
  assertStrictEquals(
    checkBudget({}, { ...film, engine: "mock", usd: 0 }, {}).ok,
    true,
  );
  assertStrictEquals(
    checkBudget({}, film, { approvedOutOfBand: true }).ok,
    true,
  );
});

Deno.test(
  "spending adds the step's units at the price it was checked at",
  () => {
    const approved = { workshop_budget: { cap_usd: 10, spent_usd: 1 } };
    const check = checkBudget(approved, film, { turnId: "turn-9" });
    assertStrictEquals(check.ok, true);
    if (!check.ok) return;
    const after = spendBudget(check.payload, film.tool, 5);
    assertStrictEquals(budgetOf(after).spent_usd, 3.5);
  },
);

Deno.test(
  "the proposed budget covers the step with room, or the user's own number",
  () => {
    const budget = budgetOf({ workshop_budget: { cap_usd: 0, spent_usd: 0 } });
    assertStrictEquals(suggestCap(budget, film), 4);
    assertStrictEquals(suggestCap(budget, film, 20), 20);
    assertStrictEquals(suggestCap(budget, film, 1), 4);
  },
);

Deno.test(
  "the user's code approves even when Carmen does not repeat the token",
  () => {
    const { payload } = requestBudget({}, 10, "turn-1", "tok");
    const check = checkBudget(payload, film, {
      turnId: "turn-2",
      userText: yes,
    });
    assertStrictEquals(check.ok, true);
  },
);

Deno.test(
  "only the tapped approval with the whole code approves, not a message that contains it",
  () => {
    // A code of digits only (about one in seven) could sit in a year, a price or a phone number.
    const { payload } = requestBudget({}, 10, "turn-1", "tok-2026");
    const answer = (userText: string) =>
      checkBudget(payload, film, { turnId: "turn-2", userText }).ok;
    for (const userText of [
      "סרטון לקמפיין 2026",
      "תתקשרי ל-054-2026111",
      "https://example.com/ab2026cd",
      "מאשר תקציב 20261",
      "לא מאשר תקציב 2026",
    ])
      assertStrictEquals(answer(userText), false, userText);
    for (const userText of [
      "מאשר תקציב 2026",
      "מאשרת תקציב 2026!",
      // Several questions answered at once: one line per question (src/lib/quickReplies.ts).
      "קצב: רגוע\nלאשר תקציב של $10 לפרויקט?: מאשר תקציב 2026",
      // The button, which names the amount it approves.
      "מאשר תקציב $10 · 2026",
    ])
      assertStrictEquals(answer(userText), true, userText);
  },
);

const filmBudget = () => {
  const priced = checkBudget(
    { workshop_budget: { cap_usd: 10, spent_usd: 0, unit_usd: {} } },
    film,
    {},
  );
  assertStrictEquals(priced.ok, true);
  if (!priced.ok) throw new Error("budget refused");
  return spendBudget(priced.payload, "workshop_produce_video", 5);
};

Deno.test("a finished film counts what it really cost, not its quote", () => {
  const quoted = filmBudget();
  assertStrictEquals(budgetOf(quoted).spent_usd, 2.5);
  const dearer = budgetOf(
    settleProduction(quoted, { usd: 4.2, inFlight: false }),
  );
  assertStrictEquals(dearer.spent_usd, 4.2);
  const cheaper = budgetOf(
    settleProduction(quoted, { usd: 1.1, inFlight: false }),
  );
  assertStrictEquals(cheaper.spent_usd, 1.1);
});

Deno.test(
  "while the film is still running the larger of quote and real charge counts",
  () => {
    const quoted = filmBudget();
    assertStrictEquals(
      budgetOf(settleProduction(quoted, { usd: 0.4, inFlight: true }))
        .spent_usd,
      2.5,
    );
    assertStrictEquals(
      budgetOf(settleProduction(quoted, { usd: 3, inFlight: true })).spent_usd,
      3,
    );
  },
);

Deno.test("settling twice does not count the film twice", () => {
  const once = settleProduction(filmBudget(), { usd: 4.2, inFlight: false });
  const twice = settleProduction(once, { usd: 4.2, inFlight: false });
  assertStrictEquals(budgetOf(twice).spent_usd, 4.2);
});

Deno.test(
  "a second film counts its own quote once, on top of what the first one cost",
  () => {
    // The first film was quoted $2.50 and really cost $2.
    const first = settleProduction(filmBudget(), { usd: 2, inFlight: false });
    const checked = checkBudget(first, film, {});
    if (!checked.ok) throw new Error("budget refused");
    const second = spendBudget(checked.payload, "workshop_produce_video", 5);
    assertStrictEquals(budgetOf(second).spent_usd, 4.5);
    // Nothing new charged yet: the first film's cost and the second's quote.
    const running = settleProduction(second, { usd: 2, inFlight: true });
    assertStrictEquals(budgetOf(running).spent_usd, 4.5);
    // Both done: what the two films really cost, $2 and $1.50.
    const done = settleProduction(running, { usd: 3.5, inFlight: false });
    assertStrictEquals(budgetOf(done).spent_usd, 3.5);
    assertStrictEquals(
      budgetOf(settleProduction(done, { usd: 3.5, inFlight: false })).spent_usd,
      3.5,
    );
  },
);

Deno.test("pictures that were not made give their reservation back", () => {
  const still: Quote = {
    tool: "workshop_make_stills",
    engine: "google",
    count: 4,
    usd: 0.4,
  };
  const checked = checkBudget(
    { workshop_budget: { cap_usd: 5, spent_usd: 0, unit_usd: {} } },
    still,
    {},
  );
  if (!checked.ok) throw new Error("budget refused");
  const spent = spendBudget(checked.payload, "workshop_make_stills", 4);
  assertStrictEquals(budgetOf(spent).spent_usd, 0.4);
  assertStrictEquals(
    budgetOf(refundBudget(spent, "workshop_make_stills", 3)).spent_usd,
    0.1,
  );
});

Deno.test("approving a budget keeps what was already settled", () => {
  const settled = settleProduction(filmBudget(), { usd: 4.2, inFlight: false });
  const { payload } = requestBudget(settled, 20, "turn-1", "tok");
  const check = checkBudget(
    payload,
    { ...film, usd: 10 },
    { turnId: "turn-2", userText: yes },
  );
  assertStrictEquals(check.ok, true);
  if (!check.ok) return;
  const budget = budgetOf(check.payload);
  assertStrictEquals(budget.spent_usd, 4.2);
  assertStrictEquals(budget.production_usd, 4.2);
});

Deno.test(
  "the approval button names the amount it approves and carries the code",
  () => {
    const prompt = budgetPrompt(3, "9AF1");
    assertMatch(prompt, /\| מאשר תקציב \$3 · 9AF1 \|/);
    const tap = "מאשר תקציב $3 · 9AF1";
    assertStrictEquals(approvesRequest(tap, "9AF1"), true);
    assertStrictEquals(approvesRequest("מאשר תקציב $3 · 9AF2", "9AF1"), false);
  },
);
