import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { FakeTime } from "jsr:@std/testing@1/time";
import { HISTORY_BACKFILL_KEY } from "../_shared/ads-sync/history-backfill.ts";
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
 * time. `flow` is the scenario blueprint's modules; `env` adds env vars.
 */
async function backfill(
  runStatuses: Array<number>,
  flow: Array<Record<string, unknown>> = [],
  env: Record<string, string> = {},
) {
  const runs = [...runStatuses];
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables,
    other: (url) => {
      if (url.pathname.endsWith("/blueprint")) {
        return Response.json({ response: { blueprint: { flow } } });
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
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key", ...env },
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
    return { status: res.status, body: await res.json(), calls: http.calls };
  } finally {
    time.restore();
  }
}

/**
 * One scheduled run over a direct-API table whose history catch-up is
 * complete, on 2026-11-25 (Israel): the windows it asks sync-google-ads-data
 * for, in order. `respond` answers each of those calls (the fake's 201 when
 * unset); the 20 s rate-limit retry pause runs on fake time.
 */
async function scheduledSyncBodies(
  settings: Record<string, unknown>,
  respond?: (body: unknown) => Response,
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: {
      crm_tables: [
        {
          id: "table-direct",
          tenant_id: TENANT,
          name: "Direct table",
          integration_type: "google_ads",
          integration_settings: {
            data_source: "direct_api",
            scheduled_history_from: "2026-07-01",
            scheduled_synced_through: "2026-11-25",
            scheduled_lookback_on: "2026-11-25",
            ...settings,
          },
        },
      ],
    },
  });
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const res = await http.fetch(input, init);
    const call = http.calls[http.calls.length - 1];
    return respond && call.url.pathname.endsWith("/sync-google-ads-data")
      ? respond(call.body)
      : res;
  };
  const time = new FakeTime(new Date("2026-11-25T12:00:00Z"));
  try {
    await withRuntime(
      {
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key" },
        fetch,
      },
      async () => {
        const handle = await servedHandler(
          new URL("./index.ts", import.meta.url),
        );
        const pending = handle(
          new Request(SUPABASE_URL, { method: "POST", body: "{}" }),
        );
        let settled = false;
        pending.finally(() => (settled = true));
        while (!settled) {
          await time.tickAsync(1000);
        }
        await (await pending).body?.cancel();
      },
    );
  } finally {
    time.restore();
  }
  return http.calls
    .filter((call) => call.url.pathname.endsWith("/sync-google-ads-data"))
    .map((call) => call.body);
}

Deno.test({
  name: "cron-sync-google-ads history backfill",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "a marker adds its window, flagged to clear it, before the refresh",
      async () => {
        const bodies = await scheduledSyncBodies({
          [HISTORY_BACKFILL_KEY]: { start: "2026-06-30", end: "2026-07-17" },
        });

        assertEquals(bodies, [
          {
            table_id: "table-direct",
            start_date: "2026-06-30",
            end_date: "2026-07-17",
            history_backfill: true,
            update_last_sync: false,
          },
          {
            table_id: "table-direct",
            start_date: "2026-11-25",
            end_date: "2026-11-25",
            scheduled_synced_through: "2026-11-25",
            scheduled_lookback_on: "2026-11-25",
            scheduled_history_from: "2026-07-01",
          },
        ]);
      },
    );

    await t.step(
      "a rate-limited refresh retries without fetching the backfill again",
      async () => {
        let refreshCalls = 0;
        const bodies = await scheduledSyncBodies(
          {
            [HISTORY_BACKFILL_KEY]: { start: "2026-06-30", end: "2026-07-17" },
          },
          (body) => {
            const isRefresh =
              (body as { start_date?: string }).start_date === "2026-11-25";
            if (isRefresh && refreshCalls++ === 0) {
              return Response.json(
                { error: "Rate limit exceeded" },
                { status: 429 },
              );
            }
            return Response.json({ success: true });
          },
        );

        assertEquals(
          bodies.map((body) => (body as { start_date: string }).start_date),
          ["2026-06-30", "2026-11-25", "2026-11-25"],
        );
      },
    );

    await t.step(
      "without a marker the run syncs the refresh only",
      async () => {
        const bodies = await scheduledSyncBodies({
          [HISTORY_BACKFILL_KEY]: null,
        });

        assertEquals(
          bodies.map((body) => (body as { start_date: string }).start_date),
          ["2026-11-25"],
        );
      },
    );
  },
});

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

    await t.step(
      "the blueprint's HTTP module posts to PUBLIC_API_URL, not SUPABASE_URL",
      async () => {
        const { calls } = await backfill(
          [200, 200],
          [{ id: 4, module: "http:ActionSendData", mapper: {} }],
          { PUBLIC_API_URL: "https://api.aios.co.il" },
        );
        const patch = calls.find(
          (c) =>
            c.method === "PATCH" && c.url.pathname.endsWith("/scenarios/42"),
        );
        const blueprint = JSON.parse(
          (patch?.body as { blueprint: string }).blueprint,
        );

        assertStrictEquals(
          blueprint.flow[0].mapper.url,
          "https://api.aios.co.il/functions/v1/webhook-google-ads-sync",
        );
      },
    );
  },
});
