import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  budgetOf,
  checkBudget,
  refundBudget,
  settleProduction,
  spendBudget,
} from "./budget.ts";
import type { PaidTool } from "./budget-types.ts";

/** Prices one step on the budget and charges it, as gatePaid and the tool do. */
function charged(
  payload: Record<string, unknown>,
  tool: PaidTool,
  usd: number,
) {
  const checked = checkBudget(
    payload,
    { tool, engine: "kling", count: 1, usd },
    {},
  );
  if (!checked.ok) throw new Error("budget refused");
  return spendBudget(checked.payload, tool, 1);
}

const approved = {
  workshop_budget: { cap_usd: 10, spent_usd: 0, unit_usd: {} },
};

Deno.test(
  "a film quote given back after another settle counted it is not taken off twice",
  () => {
    // Film 1 was quoted $3 and really cost $2.50.
    const first = settleProduction(
      charged(approved, "workshop_produce_video", 3),
      { usd: 2.5, inFlight: false },
    );
    assertStrictEquals(budgetOf(first).spent_usd, 2.5);
    // Film 2 is quoted $2, and a concurrent turn settles while a run is still in flight.
    const second = charged(first, "workshop_produce_video", 2);
    const concurrent = settleProduction(second, { usd: 2.5, inFlight: true });
    assertStrictEquals(budgetOf(concurrent).spent_usd, 4.5);
    // Film 2 never started (produce_video's lock): its $2 goes back.
    const refunded = refundBudget(concurrent, "workshop_produce_video", 1);
    assertStrictEquals(budgetOf(refunded).spent_usd, 2.5);
    // Nothing in flight: what film 1 really cost, and no less.
    assertStrictEquals(
      budgetOf(settleProduction(refunded, { usd: 2.5, inFlight: false }))
        .spent_usd,
      2.5,
    );
  },
);

Deno.test(
  "the only film given back after a settle dropped its quote leaves the pictures' spend",
  () => {
    const quoted = charged(
      charged(approved, "workshop_make_stills", 3),
      "workshop_produce_video",
      2,
    );
    // A free run of the project recorded $0 and nothing is in flight yet.
    const settled = settleProduction(quoted, { usd: 0, inFlight: false });
    const refunded = refundBudget(settled, "workshop_produce_video", 1);
    assertStrictEquals(
      budgetOf(settleProduction(refunded, { usd: 0, inFlight: false }))
        .spent_usd,
      3,
    );
  },
);
