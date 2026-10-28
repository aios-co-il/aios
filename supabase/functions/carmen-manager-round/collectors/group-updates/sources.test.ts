import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../../budget.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import type { CollectorContext } from "../types.ts";
import { groupUpdateSources } from "./sources.ts";

/** A context over a recording client. */
function context(dryRun: boolean) {
  const { db, calls } = recordingClient();
  const ctx: CollectorContext = {
    tenantId: "t1",
    settings: resolveManagerSettings(null),
    now: new Date("2026-11-01T17:37:00Z"),
    since: new Date("2026-10-31T17:37:00Z"),
    watermark: null,
    budget: RoundBudget.create(60_000, 10),
    clientIds: null,
    db,
    fixtures: null,
    dryRun,
  };
  return { ctx, calls };
}

Deno.test("groupUpdateSources", async (t) => {
  await t.step(
    "a preview never calls the model or reads the spend",
    async () => {
      const { ctx, calls } = context(true);
      const { summarize } = groupUpdateSources(ctx);
      assertEquals((await summarize.meter()).allows(), false);
      assertEquals(await summarize.ask("p"), { text: null, costUsd: 0 });
      assertEquals(calls, []);
    },
  );

  await t.step("a scheduled run meters the tenant's allowance", async () => {
    const { ctx, calls } = context(false);
    await groupUpdateSources(ctx).summarize.meter();
    assertEquals(calls.map((call) => call.path).sort(), [
      "rpc/carmen_round_llm_spend",
      "tenant_integrations",
    ]);
  });
});
