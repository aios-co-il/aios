import { assertEquals } from "jsr:@std/assert@1";
import { executeGetMaskyooCallsReport } from "./get-maskyoo-calls-report.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "Maskyoo report executes both scoped snapshot queries after client alias removal",
  async () => {
    const f = executorClient([
      [
        {
          client_id: "client",
          category: "paid",
          period_start: "2026-11-01",
          period_end: "2026-11-07",
          incoming_count: 5,
        },
      ],
      [{ id: "client", name: "Client" }],
      [{ client_id: "client", category: "paid", incoming_count: 3 }],
    ]);
    const result = await executeGetMaskyooCallsReport(
      {
        client_id: "client",
        category: "paid",
        period_start: "2026-11-01",
        period_end: "2026-11-07",
        period_compare: true,
      },
      f.context,
    );
    if (!("results" in result)) {
      throw new Error("Expected report");
    }
    assertEquals(result.results[0].incoming_calls, 5);
    assertEquals(result.previous_period?.[0].incoming_calls, 3);
    for (const call of [f.calls[0], f.calls[2]]) {
      const url = new URL(call.url);
      assertEquals(url.pathname, "/rest/v1/seo_call_snapshots");
      assertEquals(url.searchParams.get("tenant_id"), "in.(t1,shared)");
      assertEquals(url.searchParams.get("client_id"), "eq.client");
      assertEquals(url.searchParams.get("category"), "eq.paid");
    }
  },
);

Deno.test(
  "Maskyoo report without comparison performs only its current-period query",
  async () => {
    const f = executorClient([[]]);
    const result = await executeGetMaskyooCallsReport({}, f.context);
    if (!("results" in result)) {
      throw new Error("Expected report");
    }
    assertEquals(result.results, []);
    assertEquals(f.calls.length, 1);
  },
);
