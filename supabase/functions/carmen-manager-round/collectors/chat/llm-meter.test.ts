import { assertEquals } from "jsr:@std/assert@1";
import { NOW, SETTINGS } from "../../tests/chat-fixtures.ts";
import { TENANT } from "../../tests/fake-world.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { createLlmMeter, loadLlmMeter } from "./llm-meter.ts";

Deno.test("createLlmMeter", async (t) => {
  await t.step("stops at today's share, counting this run's calls", () => {
    const meter = createLlmMeter({
      monthBudgetUsd: null,
      monthSpentUsd: 0,
      dailyCapUsd: 0.01,
      daySpentUsd: 0.005,
    });
    assertEquals(meter.allows(), true);
    meter.add(0.006);
    assertEquals(
      [meter.allows(), meter.usage()],
      [false, { calls: 1, costUsd: 0.006 }],
    );
  });

  await t.step("stops once the month's budget is spent", () => {
    const meter = createLlmMeter({
      monthBudgetUsd: 50,
      monthSpentUsd: 50,
      dailyCapUsd: 1,
      daySpentUsd: 0,
    });
    assertEquals(meter.allows(), false);
  });
});

Deno.test("loadLlmMeter", async (t) => {
  const respond =
    (budget: number | null) =>
    ({ path }: { path: string }) =>
      path === "rpc/carmen_round_llm_spend"
        ? [{ project_month_usd: 10, day_usd: 0.1 }]
        : budget === null
          ? []
          : [{ settings: { monthly_budget_usd: budget } }];

  await t.step(
    "today's share is round_llm_share_pct of the budget over 30 days",
    async () => {
      const { db, calls } = recordingClient(respond(60));
      const meter = await loadLlmMeter(db, TENANT, SETTINGS, NOW);
      // 10% of $60 / 30 = $0.20 a day; $0.10 already spent today.
      assertEquals(meter.allows(), true);
      meter.add(0.1);
      assertEquals(meter.allows(), false);
      const integration = calls.find((c) => c.path === "tenant_integrations");
      assertEquals(integration?.query.get("tenant_id"), `eq.${TENANT}`);
      const spend = calls.find((c) => c.path === "rpc/carmen_round_llm_spend");
      assertEquals(spend?.body, {
        p_tenant_id: TENANT,
        p_month_start: "2026-10-01T00:00:00.000Z",
        // Midnight in Israel (UTC+2 after the clocks changed on 25.10).
        p_day_start: "2026-10-26T22:00:00.000Z",
        p_source_prefix: "manager_round:",
      });
    },
  );

  await t.step("the project's month spend stops the round", async () => {
    const { db } = recordingClient(respond(10));
    assertEquals(
      (await loadLlmMeter(db, TENANT, SETTINGS, NOW)).allows(),
      false,
    );
  });

  await t.step("a share of 0 never asks the model", async () => {
    const off = { ...SETTINGS, round_llm_share_pct: 0 };
    for (const budget of [60, null]) {
      const { db } = recordingClient(respond(budget));
      assertEquals((await loadLlmMeter(db, TENANT, off, NOW)).allows(), false);
    }
  });

  await t.step("without a budget the round may spend $1 a day", async () => {
    const { db } = recordingClient(respond(null));
    const meter = await loadLlmMeter(db, TENANT, SETTINGS, NOW);
    meter.add(0.85);
    assertEquals(meter.allows(), true);
    meter.add(0.1);
    assertEquals(meter.allows(), false);
  });
});
