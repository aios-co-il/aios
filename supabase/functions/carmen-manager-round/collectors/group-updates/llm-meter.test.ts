import { assertEquals } from "jsr:@std/assert@1";
import { resolveManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { recordingClient } from "../../tests/recording-client.ts";
import { createLlmMeter, loadLlmMeter } from "./llm-meter.ts";

const now = new Date("2026-11-10T17:30:00Z");

Deno.test("createLlmMeter", async (t) => {
  await t.step("stops at the day's share, counting this run's calls", () => {
    const meter = createLlmMeter({
      monthBudgetUsd: 30,
      monthSpentUsd: 5,
      dailyCapUsd: 0.1,
      daySpentUsd: 0.09,
    });
    assertEquals(meter.allows(), true);
    meter.add(0.02);
    assertEquals([meter.allows(), meter.usage().calls], [false, 1]);
  });

  await t.step("stops when the month's budget is spent", () => {
    const meter = createLlmMeter({
      monthBudgetUsd: 30,
      monthSpentUsd: 30,
      dailyCapUsd: 1,
      daySpentUsd: 0,
    });
    assertEquals(meter.allows(), false);
  });
});

Deno.test("loadLlmMeter", async (t) => {
  await t.step(
    "the day's share of the tenant's budget, from the round's own spend",
    async () => {
      const { db, calls } = recordingClient((call) =>
        call.path === "tenant_integrations"
          ? [{ settings: { monthly_budget_usd: 60 } }]
          : [{ project_month_usd: 10, day_usd: 0.19 }],
      );
      const meter = await loadLlmMeter(
        db,
        "t1",
        resolveManagerSettings(null),
        now,
      );
      assertEquals(meter.allows(), true);
      meter.add(0.01);
      assertEquals(meter.allows(), false);
      const spend = calls.find((c) => c.path === "rpc/carmen_round_llm_spend");
      assertEquals(spend?.body, {
        p_tenant_id: "t1",
        p_month_start: "2026-11-01T00:00:00.000Z",
        p_day_start: "2026-11-09T22:00:00.000Z",
        p_source_prefix: "manager_round:",
      });
    },
  );

  await t.step("a share of 0 turns the model off", async () => {
    const { db } = recordingClient((call) =>
      call.path === "tenant_integrations"
        ? []
        : [{ project_month_usd: 0, day_usd: 0 }],
    );
    const settings = resolveManagerSettings({
      manager: { round_llm_share_pct: 0 },
    });
    const meter = await loadLlmMeter(db, "t1", settings, now);
    assertEquals(meter.allows(), false);
  });
});
