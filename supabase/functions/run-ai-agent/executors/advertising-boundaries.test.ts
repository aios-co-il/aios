import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { loadAccountHealthClients } from "./account-health-scope.ts";
import { loadCampaignPerformanceScope } from "./campaign-performance-scope.ts";
import { loadPulseCacheRows } from "./pulse-cache-rows.ts";
import { findPendingAdDuplicate } from "./pending-ad-duplicate.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

for (const [name, load] of [
  ["health", loadAccountHealthClients],
  ["performance", loadCampaignPerformanceScope],
] as const) {
  Deno.test(
    `${name} reads only owned agencies in partner tenants`,
    async () => {
      const own = { id: "own", name: "Own" };
      const shared = { id: "shared", name: "Shared" };
      const fixture = executorClient([
        [own],
        [
          { source_tenant_id: "partner", agency_id: "owned" },
          { source_tenant_id: "other", agency_id: "unowned" },
        ],
        [{ id: "owned" }],
        [shared],
      ]);
      const result = await load({}, fixture.context);
      assertEquals(
        Array.isArray(result) ? result : result.scope?.targetClients,
        [own, shared],
      );
      assertEquals(fixture.calls.length, 4);
      const queries = fixture.calls.map((call) => new URL(call.url));
      assertEquals(queries[0].searchParams.get("tenant_id"), "eq.t1");
      assertEquals(queries[0].searchParams.get("status"), "in.(active)");
      assertEquals(queries[2].searchParams.get("tenant_id"), "eq.t1");
      assertEquals(queries[3].searchParams.get("tenant_id"), "eq.partner");
      assertEquals(queries[3].searchParams.get("agency_id"), "eq.owned");
    },
  );
}

Deno.test(
  "health tolerates its legacy read failure; performance rejects it",
  async () => {
    function failure() {
      return new Response(JSON.stringify({ message: "denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const health = executorClient([failure(), []]);
    assertEquals(await loadAccountHealthClients({}, health.context), []);
    const performance = executorClient([failure()]);
    await assertRejects(async () => {
      await loadCampaignPerformanceScope({}, performance.context);
    });
    assertEquals(performance.calls.length, 1);
  },
);

Deno.test(
  "pulse optional-column fallbacks precede deduplication and assignment",
  async () => {
    function missing(column: string) {
      return new Response(
        JSON.stringify({ message: `column ${column} does not exist` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const fixture = executorClient(
      [
        missing("campaign_breakdown"),
        missing("last_client_call_at"),
        [
          {
            client_id: "a",
            calculated_at: "2026-01-02",
            status: "healthy",
            flags: [],
            clients: { name: "Latest" },
          },
          {
            client_id: "a",
            calculated_at: "2026-01-01",
            status: "critical",
            flags: [],
            clients: { name: "Old" },
          },
          {
            client_id: "b",
            calculated_at: "2026-01-02",
            status: "healthy",
            flags: [],
          },
        ],
        [{ client_id: "a" }],
      ],
      200,
      { callerCampaignerId: "staff" },
    );
    const rows = await loadPulseCacheRows({}, fixture.context);
    assertEquals(
      rows.map((row) => [row.client_id, row.client_name]),
      [["a", "Latest"]],
    );
    const queries = fixture.calls.map((call) => new URL(call.url));
    assertEquals(
      queries.slice(0, 3).map((url) => url.searchParams.get("tenant_id")),
      Array(3).fill("in.(t1,shared)"),
    );
    const columns = queries
      .slice(0, 3)
      .map((url) => url.searchParams.get("select") || "");
    assertEquals(
      columns.map((select) => select.includes("campaign_breakdown")),
      [true, false, false],
    );
    assertEquals(
      columns.map((select) => select.includes("last_client_call_at")),
      [true, true, false],
    );
    assertEquals(queries[3].searchParams.get("campaigner_id"), "eq.staff");
  },
);

Deno.test(
  "duplicate approvals reuse the newest matching source within the tenant",
  async () => {
    const fixture = executorClient([
      [
        { id: "other", tool_input: { source_ad_id: "other" } },
        { id: "match", tool_input: { source_ad_id: "source" } },
        { id: "older", tool_input: { source_ad_id: "source" } },
      ],
    ]);
    const approval = await findPendingAdDuplicate(
      fixture.context.supabase,
      "t1",
      "source",
    );
    assertEquals(approval?.id, "match");
    const query = new URL(fixture.calls[0].url).searchParams;
    assertEquals(query.get("tenant_id"), "eq.t1");
    assertEquals(query.get("status"), "eq.pending");
    assertEquals(query.get("limit"), "5");
    assertEquals(query.get("order"), "created_at.desc");
    assertEquals(fixture.calls[0].method, "GET");
  },
);
