import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { loadPulseCacheRows } from "./pulse-cache-rows.ts";
import { executorClient } from "./executor-client.test-fixture.ts";
describe("loadPulseCacheRows", () => {
  it("pulse optional-column fallbacks precede deduplication and assignment", async () => {
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
  });
});
