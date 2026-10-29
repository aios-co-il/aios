import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { FakeTime } from "jsr:@std/testing@1/time";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const TENANT = "11111111-1111-4111-8111-111111111111";

/** One Make-synced Google Ads table and the tenant's Make connection. */
const tables = {
  crm_tables: [
    {
      id: "table-1",
      tenant_id: TENANT,
      name: "Make table",
      integration_type: "google_ads",
      integration_settings: { data_source: "make_api", make_scenario_id: 42 },
    },
  ],
  tenant_integrations: [
    {
      tenant_id: TENANT,
      integration_type: "make_api",
      settings: { api_token: "make-token", region: "eu2" },
    },
  ],
};

/**
 * A two-day Make backfill where the scenario run answers each call with the
 * next status in `runStatuses`. The 5 s pause after a good day runs on fake
 * time.
 */
async function backfill(runStatuses: Array<number>) {
  const runs = [...runStatuses];
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables,
    other: (url) => {
      if (url.pathname.endsWith("/blueprint")) {
        return Response.json({ response: { blueprint: { flow: [] } } });
      }
      if (url.pathname.endsWith("/run")) {
        const status = runs.shift() ?? 500;
        return Response.json({ ok: status === 200 }, { status });
      }
      return Response.json({});
    },
  });
  const time = new FakeTime(new Date("2026-11-04T08:00:00Z"));
  try {
    const res = await withRuntime(
      {
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key" },
        fetch: http.fetch,
      },
      async () => {
        const handle = await servedHandler(
          new URL("./index.ts", import.meta.url),
        );
        const pending = handle(
          new Request(SUPABASE_URL, {
            method: "POST",
            body: JSON.stringify({
              backfill_from: "2026-11-01",
              backfill_to: "2026-11-02",
            }),
          }),
        );
        let settled = false;
        pending.finally(() => (settled = true));
        while (!settled) {
          await time.tickAsync(1000);
        }
        return await pending;
      },
    );
    return { status: res.status, body: await res.json() };
  } finally {
    time.restore();
  }
}

Deno.test({
  name: "cron-sync-google-ads Make backfill",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "every day failed: one failed table, and the run answers 502",
      async () => {
        const { status, body } = await backfill([500, 500]);
        assertStrictEquals(status, 502);
        assertEquals(
          [body.success, body.tables_synced, body.tables_failed],
          [false, 0, 1],
        );
        assertStrictEquals(body.results.length, 1);
        assertEquals(
          body.results[0].failed_days.map((day: { date: string }) => day.date),
          ["2026-11-01", "2026-11-02"],
        );
      },
    );

    await t.step(
      "one day synced: the table counts once, as synced",
      async () => {
        const { status, body } = await backfill([200, 500]);
        assertStrictEquals(status, 200);
        assertEquals(
          [body.success, body.tables_synced, body.tables_failed],
          [true, 1, 0],
        );
        assertEquals(
          [body.results[0].status, body.results[0].days],
          ["backfilled", 1],
        );
      },
    );
  },
});
