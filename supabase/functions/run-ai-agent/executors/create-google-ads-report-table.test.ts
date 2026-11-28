import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing/bdd";
import { executeCreateGoogleAdsReportTable } from "./create-google-ads-report-table.ts";
import {
  executorClient,
  MANAGER_SCOPE,
} from "./executor-client.test-fixture.ts";

describe("executeCreateGoogleAdsReportTable", () => {
  it("reads a manager's client only within the caller's tenants", async () => {
    const fixture = executorClient(
      (url) => {
        if (url.pathname.endsWith("/clients")) {
          // PostgREST answers .single() with 406 when no row matches.
          return new Response(
            JSON.stringify({ code: "PGRST116", message: "no rows" }),
            { status: 406, headers: { "Content-Type": "application/json" } },
          );
        }
        return [];
      },
      200,
      MANAGER_SCOPE,
    );

    const result = await executeCreateGoogleAdsReportTable(
      { client_id: "c9", customer_id: "123-456-7890" },
      fixture.context,
    );

    assertEquals(result, { error: "לקוח לא נמצא" });
    const clientRead = fixture.calls.find((call) =>
      call.url.includes("/clients"),
    );
    assertEquals(
      new URL(clientRead?.url ?? "").searchParams.get("tenant_id"),
      "in.(t1,shared)",
    );
  });
});
