import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import { TENANT, world } from "../tests/fake-world.ts";
import { contactCollector } from "./contact/collector.ts";
import { collectorContext } from "./context.ts";

Deno.test("collectorContext", async (t) => {
  await t.step(
    "loads the tenant's pulse_alert_rules as stored now",
    async () => {
      const w = world();
      const ctx = collectorContext(
        deps(w),
        {
          tenantId: TENANT,
          roundId: "r1",
          settings: resolveManagerSettings(null),
          now: w.now,
          budget: RoundBudget.create(60_000, 10),
          state: [],
          due: [],
          clientIds: null,
          fixtures: null,
          dryRun: false,
        },
        contactCollector,
      );
      w.tenants[0].pulse_alert_rules = { no_contact_days: 10 };
      assertEquals(await ctx.loadRules(), { no_contact_days: 10 });
    },
  );
});
