import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../_shared/manager-round/settings.ts";
import { RoundBudget } from "../budget.ts";
import { deps } from "../tests/fakes.ts";
import { TENANT, world } from "../tests/fake-world.ts";
import { selfTestCollector } from "./self-test.ts";

Deno.test("selfTestCollector", async (t) => {
  await t.step(
    "selfTestCollector echoes valid fixture candidates only",
    async () => {
      const now = new Date("2026-11-01T08:00:00Z");
      const result = await selfTestCollector.collect({
        tenantId: TENANT,
        settings: resolveManagerSettings(null),
        loadRules: () => Promise.resolve(null),
        now,
        since: now,
        watermark: null,
        budget: RoundBudget.create(1000, 0),
        clientIds: null,
        db: deps(world()).db,
        dryRun: true,
        fixtures: {
          self_test: [
            {
              kind: "no_contact",
              fingerprint: "client:c1",
              summary_he: "לקוח א: אין קשר",
              client_id: "c1",
              evidence: { days: 15 },
            },
            { kind: "self_test", fingerprint: "x", summary_he: "סוג לא קיים" },
            {
              kind: "data_gap",
              fingerprint: "y",
              summary_he: "חומרה לא קיימת",
              severity: "high",
            },
            "not an object",
          ],
        },
      });
      assertEquals(result.candidates, [
        {
          kind: "no_contact",
          severity: "warning",
          fingerprint: "client:c1",
          summary_he: "לקוח א: אין קשר",
          client_id: "c1",
          agency_id: null,
          source_event_at: now.toISOString(),
          evidence: { days: 15 },
          owner_user_id: null,
        },
      ]);
      assertEquals(result.coverage.complete, false);
    },
  );
});
