import { assertStrictEquals } from "jsr:@std/assert@1";
import { budgetOf, checkBudget, spendBudget } from "./budget.ts";
import { settleFromRuns } from "./budget-settle.ts";

type Run = { kind: string; status: string; cost_usd: number };

/** marketing_runs as the render worker left them; the query keeps only the kinds it asks for. */
function runsDb(rows: Run[]) {
  return {
    from: () => {
      let kinds: string[] | null = null;
      const query = {
        select: () => query,
        eq: () => query,
        in: (_column: string, values: string[]) => {
          kinds = values;
          return query;
        },
        then: (resolve: (value: unknown) => unknown) =>
          resolve({
            data: rows.filter((run) => !kinds || kinds.includes(run.kind)),
            error: null,
          }),
      };
      return query;
    },
  };
}

/** A film quoted at $2.50, sound effects included, and charged to the budget. */
function quotedFilm() {
  const checked = checkBudget(
    { workshop_budget: { cap_usd: 10, spent_usd: 0, unit_usd: {} } },
    {
      tool: "workshop_produce_video",
      engine: "openrouter",
      count: 1,
      usd: 2.5,
    },
    {},
  );
  if (!checked.ok) throw new Error("budget refused");
  return spendBudget(checked.payload, "workshop_produce_video", 1);
}

Deno.test(
  "the sound effects the production's render paid for count against the budget",
  async () => {
    const settled = await settleFromRuns(
      runsDb([
        { kind: "clip", status: "completed", cost_usd: 2 },
        { kind: "voice", status: "completed", cost_usd: 0.3 },
        { kind: "render", status: "completed", cost_usd: 0.09 },
      ]),
      "tenant-1",
      "item-1",
      quotedFilm(),
    );
    assertStrictEquals(budgetOf(settled).spent_usd, 2.39);
  },
);

Deno.test("while the render still runs, the film keeps its quote", async () => {
  const settled = await settleFromRuns(
    runsDb([
      { kind: "clip", status: "completed", cost_usd: 2 },
      { kind: "render", status: "running", cost_usd: 0 },
    ]),
    "tenant-1",
    "item-1",
    quotedFilm(),
  );
  assertStrictEquals(budgetOf(settled).spent_usd, 2.5);
});
