import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeDb } from "./campaign-status-alerts/tests/fake-db.ts";
import { resolveMetaReportToken } from "./meta-report-token.ts";

Deno.test(
  "resolveMetaReportToken: the table's stored connection first",
  async () => {
    const { db, calls } = fakeDb(() => ({
      data: { api_key: "stored-key", shared_from_integration_id: null },
      error: null,
    }));
    const token = await resolveMetaReportToken(db, {
      tenantId: "t1",
      integrationId: "int-1",
    });
    assertStrictEquals(token, "stored-key");
    assertStrictEquals(calls.length, 1);
    assertStrictEquals(calls[0].filters[0], "id=int-1");
  },
);

Deno.test(
  "resolveMetaReportToken: falls back to the tenant's org connection",
  async () => {
    const { db, calls } = fakeDb((call) =>
      call.filters.includes("connection_visibility in org,private")
        ? {
            data: { api_key: "org-key", shared_from_integration_id: null },
            error: null,
          }
        : { data: null, error: null },
    );
    const token = await resolveMetaReportToken(db, {
      tenantId: "t1",
      integrationId: "int-gone",
    });
    assertStrictEquals(token, "org-key");
    assertStrictEquals(calls.length, 2);
  },
);

Deno.test(
  "resolveMetaReportToken: a shared connection uses its source key",
  async () => {
    const { db, calls } = fakeDb((call) =>
      call.filters.includes("id=src-1")
        ? { data: { api_key: "source-key" }, error: null }
        : {
            data: { api_key: null, shared_from_integration_id: "src-1" },
            error: null,
          },
    );
    const token = await resolveMetaReportToken(db, {
      tenantId: "t1",
      integrationId: null,
    });
    assertStrictEquals(token, "source-key");
    assertEquals(
      calls.map((c) => c.filters[0]),
      ["tenant_id=t1", "tenant_id=t1", "id=src-1"],
    );
  },
);
