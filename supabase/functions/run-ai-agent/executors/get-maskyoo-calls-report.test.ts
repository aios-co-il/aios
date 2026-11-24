import { assertEquals, assertRejects } from "jsr:@std/assert@1";
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

Deno.test(
  "Maskyoo client lookup failure is not reported as no match",
  async () => {
    const f = executorClient([
      new Response(JSON.stringify({ message: "lookup failed" }), {
        status: 500,
      }),
    ]);
    await assertRejects(() =>
      executeGetMaskyooCallsReport({ client_name: "test" }, f.context),
    );
  },
);

Deno.test(
  "Maskyoo comparison failure is not reported as empty results",
  async () => {
    const f = executorClient([
      [],
      new Response(JSON.stringify({ message: "comparison failed" }), {
        status: 500,
      }),
    ]);
    await assertRejects(() =>
      executeGetMaskyooCallsReport({ period_compare: true }, f.context),
    );
  },
);

Deno.test(
  "Maskyoo enrichment scopes client names and falls back to raw ID",
  async () => {
    const f = executorClient([
      [{ client_id: "foreign", incoming_count: 1 }],
      [],
    ]);
    const result = await executeGetMaskyooCallsReport({}, f.context);
    if (!("results" in result)) {
      throw new Error("Expected report");
    }
    assertEquals(
      new URL(f.calls[1].url).searchParams.get("tenant_id"),
      "in.(t1,shared)",
    );
    assertEquals(result.results[0].client_name, "foreign");
  },
);
