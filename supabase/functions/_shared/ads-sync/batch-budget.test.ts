import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { BATCH_TIME_BUDGET_MS, startBatchBudget } from "./batch-budget.ts";

/** A clock the test moves by hand. */
function manualClock(start = 1_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** Takes tables from `tables` while the budget allows, each costing its ms. */
function runTables(
  budget: ReturnType<typeof startBatchBudget>,
  clock: ReturnType<typeof manualClock>,
  tables: Array<number>,
): number {
  for (const cost of tables) {
    if (!budget.take()) {
      break;
    }
    clock.advance(cost);
  }
  return budget.taken;
}

Deno.test("startBatchBudget", async (t) => {
  await t.step("stops starting tables once the budget is spent", () => {
    const clock = manualClock();
    const budget = startBatchBudget(0, { budgetMs: 100, now: clock.now });

    const taken = runTables(budget, clock, [40, 40, 40, 40, 40]);

    assertStrictEquals(taken, 3);
    assertStrictEquals(budget.nextOffset(5), 3);
  });

  await t.step("always takes the first table, however slow", () => {
    const clock = manualClock();
    const budget = startBatchBudget(7, { budgetMs: 100, now: clock.now });
    clock.advance(500);

    const taken = runTables(budget, clock, [500, 10]);

    assertStrictEquals(taken, 1);
    assertStrictEquals(budget.nextOffset(9), 8);
  });

  await t.step("the next offset is the first table not taken", () => {
    const clock = manualClock();
    const budget = startBatchBudget(4, { budgetMs: 100, now: clock.now });

    runTables(budget, clock, [60, 60, 60]);

    assertStrictEquals(budget.nextOffset(20), 6);
  });

  await t.step("the last batch returns no next offset", () => {
    const clock = manualClock();
    const budget = startBatchBudget(8, { budgetMs: 100, now: clock.now });

    const taken = runTables(budget, clock, [10, 10]);

    assertEquals([taken, budget.nextOffset(10)], [2, null]);
  });

  await t.step("defaults to the documented budget and Date.now", () => {
    const budget = startBatchBudget(0);

    assertStrictEquals(budget.take(), true);
    assertStrictEquals(budget.take(), true);
    assertStrictEquals(BATCH_TIME_BUDGET_MS, 80_000);
  });
});
