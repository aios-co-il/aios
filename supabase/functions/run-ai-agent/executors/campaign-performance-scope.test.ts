import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { loadCampaignPerformanceScope } from "./campaign-performance-scope.ts";
import { executorClient } from "./executor-client.test-fixture.ts";
describe("loadCampaignPerformanceScope", () => {
  it("reads only owned agencies in partner tenants", async () => {
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
    const result = await loadCampaignPerformanceScope({}, fixture.context);
    assertEquals(result.scope?.targetClients, [own, shared]);
    assertEquals(fixture.calls.length, 4);
    const queries = fixture.calls.map((call) => new URL(call.url));
    assertEquals(queries[0].searchParams.get("tenant_id"), "eq.t1");
    assertEquals(queries[0].searchParams.get("status"), "in.(active)");
    assertEquals(queries[2].searchParams.get("tenant_id"), "eq.t1");
    assertEquals(queries[3].searchParams.get("tenant_id"), "eq.partner");
    assertEquals(queries[3].searchParams.get("agency_id"), "eq.owned");
  });
  it("rejects a scope read failure", async () => {
    function failure() {
      return new Response(JSON.stringify({ message: "denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const performance = executorClient([failure()]);
    await assertRejects(async () => {
      await loadCampaignPerformanceScope({}, performance.context);
    });
    assertEquals(performance.calls.length, 1);
  });
});
