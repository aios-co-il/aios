import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { loadAccountHealthClients } from "./account-health-scope.ts";
import { executorClient } from "./executor-client.test-fixture.ts";
describe("loadAccountHealthClients", () => {
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
    const result = await loadAccountHealthClients({}, fixture.context);
    assertEquals(result, [own, shared]);
    assertEquals(fixture.calls.length, 4);
    const queries = fixture.calls.map((call) => new URL(call.url));
    assertEquals(queries[0].searchParams.get("tenant_id"), "eq.t1");
    assertEquals(queries[0].searchParams.get("status"), "in.(active)");
    assertEquals(queries[2].searchParams.get("tenant_id"), "eq.t1");
    assertEquals(queries[3].searchParams.get("tenant_id"), "eq.partner");
    assertEquals(queries[3].searchParams.get("agency_id"), "eq.owned");
  });
  it("tolerates its legacy read failure", async () => {
    function failure() {
      return new Response(JSON.stringify({ message: "denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const health = executorClient([failure(), []]);
    assertEquals(await loadAccountHealthClients({}, health.context), []);
  });
});
