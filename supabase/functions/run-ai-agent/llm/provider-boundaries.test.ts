import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { buildLLMChain } from "./chain.ts";
import { capToolsForTarget } from "./tool-cap.ts";
import { recordProviderFailover } from "./failover.ts";
import { estimateLLMCostUSD } from "./cost.ts";
import type { LLMTarget } from "./contracts.ts";
import { executorClient } from "../executors/test-client.ts";

Deno.test(
  "provider chain keeps the primary first, deduplicates it, and skips missing keys",
  async () => {
    const settings = { google_api_key: "google", openai_api_key: "openai" };
    const fixture = executorClient(Array(3).fill({ settings }));
    const chain = await buildLLMChain(
      fixture.context.supabase,
      "t1",
      "google/gemini-3-flash-preview",
    );
    assertEquals(
      chain.map((target) => [target.provider, target.key]),
      [
        ["google", "google"],
        ["openai", "openai"],
      ],
    );
    assertEquals(fixture.calls.length, 3);
    for (const call of fixture.calls) {
      const query = new URL(call.url).searchParams;
      assertEquals(query.get("tenant_id"), "eq.t1");
      assertEquals(query.get("is_active"), "eq.true");
      assertEquals(query.get("order"), "updated_at.desc");
    }
  },
);

Deno.test(
  "OpenAI capping reserves pulse and approval tools before ordinary tools",
  () => {
    const target: LLMTarget = {
      provider: "openai",
      model: "test",
      label: "test",
      key: "test",
      url: "test",
    };
    const tools = [
      ...Array.from({ length: 140 }, (_, index) => ({
        function: { name: `ordinary_${index}` },
      })),
      { function: { name: "refresh_campaign_pulse" } },
      { function: { name: "execute_pending_approval" } },
      { function: { name: "create_supplier" } },
    ];
    const capped = capToolsForTarget(target, tools);
    assertEquals(capped.length, 128);
    assertEquals(
      capped.slice(0, 2).map((tool) => tool.function.name),
      ["refresh_campaign_pulse", "execute_pending_approval"],
    );
    assertEquals(
      capped.some((tool) => tool.function.name === "create_supplier"),
      false,
    );
    assertStrictEquals(
      capToolsForTarget({ ...target, provider: "google" }, tools),
      tools,
    );
    const belowCap = tools.slice(0, 128);
    assertStrictEquals(capToolsForTarget(target, belowCap), belowCap);
  },
);

Deno.test(
  "failover deduplication precedes the log and notification in order",
  async () => {
    const recent = executorClient([[{ id: "recent" }]]);
    await recordProviderFailover(
      recent.context.supabase,
      "t1",
      "google/a",
      "openai/b",
      "quota",
    );
    assertEquals(recent.calls.length, 1);
    const fresh = executorClient([[], null, null]);
    await recordProviderFailover(
      fresh.context.supabase,
      "t1",
      "google/a",
      "openai/b",
      "quota",
    );
    assertEquals(
      fresh.calls.map((call) => [call.method, new URL(call.url).pathname]),
      [
        ["GET", "/rest/v1/integration_alerts_log"],
        ["POST", "/rest/v1/integration_alerts_log"],
        ["POST", "/rest/v1/rpc/claude_notify_david"],
      ],
    );
    assertEquals(
      (fresh.calls[1].body as { tenant_id: string }).tenant_id,
      "t1",
    );
  },
);

Deno.test(
  "usage estimates retain mini-model precedence and unknown/zero null costs",
  () => {
    assertEquals(
      estimateLLMCostUSD("openai/gpt-4o-mini", 1_000_000, 1_000_000),
      0.75,
    );
    assertEquals(estimateLLMCostUSD("gpt-4.1-mini", 1_000_000, 1_000_000), 2);
    assertEquals(estimateLLMCostUSD("unknown", 100, 100), null);
    assertEquals(estimateLLMCostUSD("gemini", 0, 0), null);
  },
);
