import { assertEquals } from "jsr:@std/assert@1";
import { HISTORY_BACKFILL_KEY } from "../_shared/ads-sync/history-backfill.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const SERVICE_KEY = "service-key";
const USER_JWT = "user-jwt";
const TENANT = "11111111-1111-4111-8111-111111111111";
const WINDOW = { start: "2026-06-30", end: "2026-07-17" };

/** Who calls the sync: the internal cron with the service role, or a signed-in user. */
type Caller = "internal-cron" | "user";

/**
 * One sync of a direct-API table whose history backfill marker is set, flagged
 * `history_backfill: true`, where Google answers every query with no rows and
 * nothing is stored for those days, so the outcome is `ok`
 * (confirmEmptyPlan). Returns the integration_settings each crm_tables update
 * wrote, in order.
 */
async function syncFlaggedBackfill(caller: Caller) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: {
      crm_tables: [
        {
          id: "table-direct",
          tenant_id: TENANT,
          integration_type: "google_ads",
          integration_settings: {
            data_source: "direct_api",
            customer_id: "1234567890",
            [HISTORY_BACKFILL_KEY]: WINDOW,
          },
        },
      ],
      tenant_integrations: [
        {
          id: "integration-1",
          tenant_id: TENANT,
          integration_type: "google_ads",
          is_active: true,
          api_key: "google-access-token",
          settings: {},
        },
      ],
    },
    users: { [USER_JWT]: "user-1" },
    other: () => Response.json([]),
  });
  const headers: Record<string, string> =
    caller === "internal-cron"
      ? { Authorization: `Bearer ${SERVICE_KEY}`, "x-internal-cron": "true" }
      : { Authorization: `Bearer ${USER_JWT}` };

  const res = await withRuntime(
    {
      env: {
        SUPABASE_URL,
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      },
      fetch: http.fetch,
    },
    async () => {
      const handle = await servedHandler(
        new URL("./index.ts", import.meta.url),
      );
      return await handle(
        new Request(SUPABASE_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            table_id: "table-direct",
            start_date: WINDOW.start,
            end_date: WINDOW.end,
            update_last_sync: false,
            history_backfill: true,
          }),
        }),
      );
    },
  );
  const body = await res.json();
  const settingsWrites = http.calls
    .filter(
      (call) =>
        call.method === "PATCH" &&
        call.url.pathname === "/rest/v1/crm_tables" &&
        isSettingsUpdate(call.body),
    )
    .map((call) => (call.body as SettingsUpdate).integration_settings);
  return { status: res.status, body, settingsWrites };
}

type SettingsUpdate = { integration_settings: Record<string, unknown> };

/** Whether a crm_tables update body writes integration_settings. */
function isSettingsUpdate(body: unknown): body is SettingsUpdate {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).integration_settings === "object"
  );
}

Deno.test({
  name: "sync-google-ads-data history backfill marker",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "an ok run flagged by the internal cron clears the marker",
      async () => {
        const { status, body, settingsWrites } =
          await syncFlaggedBackfill("internal-cron");

        assertEquals([status, body.outcome?.status], [200, "ok"]);
        assertEquals(settingsWrites.at(-1)?.[HISTORY_BACKFILL_KEY], null);
      },
    );

    await t.step("a user's flagged run leaves the marker", async () => {
      const { status, body, settingsWrites } =
        await syncFlaggedBackfill("user");

      assertEquals([status, body.outcome?.status], [200, "ok"]);
      for (const settings of settingsWrites) {
        assertEquals(settings[HISTORY_BACKFILL_KEY], WINDOW);
      }
    });
  },
});
