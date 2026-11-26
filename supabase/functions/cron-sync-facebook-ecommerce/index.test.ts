import { assertEquals } from "jsr:@std/assert@1";
import { FakeTime } from "jsr:@std/testing@1/time";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const TENANT = "11111111-1111-4111-8111-111111111111";

/** Ecommerce tables t0..t(n-1) with no sync markers, so each needs a catch-up and a refresh. */
function ecommerceTables(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    tenant_id: TENANT,
    name: `Table ${i}`,
    integration_type: "facebook_ecommerce",
    campaign_active: true,
    integration_settings: {},
  }));
}

/**
 * Runs one invocation from `batchOffset` where each call to
 * sync-facebook-ecommerce takes `syncMs` of fake time (two calls per table),
 * and returns what it queued and sent.
 */
async function invoke(tableCount: number, batchOffset: number, syncMs: number) {
  const kicks: Array<Record<string, unknown>> = [];
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: { crm_tables: ecommerceTables(tableCount) },
    rpc: {
      kick_internal_function: (args) => {
        kicks.push(args);
        return null;
      },
    },
  });
  const time = new FakeTime(new Date("2026-11-25T03:00:00Z"));
  /** The fake HTTP, with each sync call spending `syncMs`. */
  function slowFetch(input: string | URL | Request, init?: RequestInit) {
    const url = input instanceof Request ? input.url : String(input);
    if (url.endsWith("/functions/v1/sync-facebook-ecommerce")) {
      time.tick(syncMs);
    }
    return http.fetch(input, init);
  }

  try {
    await withRuntime(
      {
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key" },
        fetch: slowFetch,
      },
      async () => {
        const handle = await servedHandler(
          new URL("./index.ts", import.meta.url),
        );
        const res = await handle(
          new Request(SUPABASE_URL, {
            method: "POST",
            body: JSON.stringify({ batch_offset: batchOffset }),
          }),
        );
        await res.body?.cancel();
      },
    );
    /** How many requests went to a path ending in `path`. */
    function called(path: string) {
      return http.calls.filter((call) => call.url.pathname.endsWith(path))
        .length;
    }
    return {
      kicks,
      syncCalls: called("/sync-facebook-ecommerce"),
      pulses: called("/campaign-pulse-snapshot"),
    };
  } finally {
    time.restore();
  }
}

Deno.test({
  name: "cron-sync-facebook-ecommerce time-budgeted batches",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "slow tables: stops once the budget is spent and kicks the first unprocessed offset",
      async () => {
        const { kicks, syncCalls, pulses } = await invoke(6, 0, 20_000);

        assertEquals(syncCalls, 4);
        assertEquals(kicks, [
          {
            p_function: "cron-sync-facebook-ecommerce",
            p_body: { batch_offset: 2 },
          },
        ]);
        assertEquals(pulses, 0);
      },
    );

    await t.step(
      "a table slower than the budget still runs, so the chain advances",
      async () => {
        const { kicks, syncCalls } = await invoke(6, 3, 60_000);

        assertEquals(syncCalls, 2);
        assertEquals(kicks[0].p_body, { batch_offset: 4 });
      },
    );

    await t.step(
      "last batch: no kick, and the pulse snapshot runs once",
      async () => {
        const { kicks, syncCalls, pulses } = await invoke(6, 4, 20_000);

        assertEquals(syncCalls, 4);
        assertEquals([kicks.length, pulses], [0, 1]);
      },
    );
  },
});
