import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const TENANT = "11111111-1111-4111-8111-111111111111";

/** A GA report table on connection `integrationId`. */
function gaTable(id: string, integrationId: string) {
  return {
    id,
    tenant_id: TENANT,
    name: `GA ${id}`,
    integration_type: "google_analytics",
    integration_settings: { integrationId, propertyId: "123" },
  };
}

/** One cron run over these tables and connections; sync-google-analytics-data answers `syncStatus`. */
async function runCron(
  tables: Array<ReturnType<typeof gaTable>>,
  integrations: Array<Record<string, unknown>>,
  syncStatus = 200,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: { crm_tables: tables, tenant_integrations: integrations },
  });
  const fetch = (input: string | URL | Request, init?: RequestInit) =>
    String(input).endsWith("/functions/v1/sync-google-analytics-data")
      ? Promise.resolve(Response.json({ ok: true }, { status: syncStatus }))
      : http.fetch(input, init);
  const res = await withRuntime(
    {
      env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key" },
      fetch,
    },
    async () => {
      const handle = await servedHandler(
        new URL("./index.ts", import.meta.url),
      );
      return await handle(new Request(SUPABASE_URL, { method: "POST" }));
    },
  );
  return { status: res.status, body: await res.json() };
}

Deno.test({
  name: "cron-sync-google-analytics",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "a table on a lost connection failed, so a run of only those answers 502",
      async () => {
        const { status, body } = await runCron(
          [gaTable("ga-1", "int-1"), gaTable("ga-2", "int-2")],
          [
            { id: "int-1", is_active: true, settings: { needs_reauth: true } },
            { id: "int-2", is_active: false, settings: {} },
          ],
        );
        assertStrictEquals(status, 502);
        assertEquals(
          {
            success: body.success,
            synced: body.tables_synced,
            failed: body.tables_failed,
          },
          { success: false, synced: 0, failed: 2 },
        );
        assertEquals(
          body.results.map((row: { status: string }) => row.status),
          ["failed", "failed"],
        );
      },
    );

    await t.step(
      "one table synced: success, with the lost one still counted",
      async () => {
        const { status, body } = await runCron(
          [gaTable("ga-1", "int-1"), gaTable("ga-2", "int-2")],
          [
            { id: "int-1", is_active: true, settings: {} },
            { id: "int-2", is_active: true, settings: { needs_reauth: true } },
          ],
        );
        assertStrictEquals(status, 200);
        assertEquals(
          [body.success, body.tables_synced, body.tables_failed],
          [true, 1, 1],
        );
      },
    );

    await t.step(
      "a table without a property is skipped, not failed",
      async () => {
        const { status, body } = await runCron(
          [{ ...gaTable("ga-1", "int-1"), integration_settings: {} }],
          [],
        );
        assertStrictEquals(status, 200);
        assertEquals([body.tables_failed, body.tables_skipped], [0, 1]);
      },
    );
  },
});
