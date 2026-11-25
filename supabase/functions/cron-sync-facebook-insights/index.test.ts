import { assertEquals } from "jsr:@std/assert@1";
import { FakeTime } from "jsr:@std/testing@1/time";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const TENANT = "11111111-1111-4111-8111-111111111111";

/** Insights tables t0..t(n-1) with an ad account and no Facebook connection. */
function insightsTables(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    tenant_id: TENANT,
    name: `Table ${i}`,
    integration_type: "facebook_insights",
    campaign_active: true,
    integration_settings: { ad_account_id: `act_${i}` },
  }));
}

/**
 * Runs one invocation from `batchOffset` where each connection lookup takes
 * `lookupMs` of fake time (two lookups per table), and returns what it
 * answered, the kicks it queued and the pulse requests it sent.
 */
async function invoke(
  tableCount: number,
  batchOffset: number,
  lookupMs: number,
) {
  const kicks: Array<Record<string, unknown>> = [];
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: { crm_tables: insightsTables(tableCount), tenant_integrations: [] },
    rpc: {
      kick_internal_function: (args) => {
        kicks.push(args);
        return null;
      },
    },
  });
  const time = new FakeTime(new Date("2026-11-25T03:00:00Z"));
  /** The fake HTTP, with each connection lookup spending `lookupMs`. */
  function slowFetch(input: string | URL | Request, init?: RequestInit) {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/tenant_integrations")) {
      time.tick(lookupMs);
    }
    return http.fetch(input, init);
  }

  try {
    const res = await withRuntime(
      {
        env: { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "service-key" },
        fetch: slowFetch,
      },
      async () => {
        const handle = await servedHandler(
          new URL("./index.ts", import.meta.url),
        );
        return await handle(
          new Request(SUPABASE_URL, {
            method: "POST",
            body: JSON.stringify({ batch_offset: batchOffset }),
          }),
        );
      },
    );
    const pulses = http.calls.filter((call) =>
      call.url.pathname.endsWith("/campaign-pulse-snapshot"),
    );
    return { body: await res.json(), kicks, pulses: pulses.length };
  } finally {
    time.restore();
  }
}

Deno.test({
  name: "cron-sync-facebook-insights time-budgeted batches",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "slow tables: stops once the budget is spent and kicks the first unprocessed offset",
      async () => {
        const { body, kicks, pulses } = await invoke(6, 0, 20_000);

        assertEquals([body.batch_size, body.has_more], [2, true]);
        assertEquals(kicks, [
          {
            p_function: "cron-sync-facebook-insights",
            p_body: { batch_offset: 2 },
          },
        ]);
        assertEquals(pulses, 0);
      },
    );

    await t.step(
      "a table slower than the budget still runs, so the chain advances",
      async () => {
        const { body, kicks } = await invoke(6, 3, 60_000);

        assertEquals(body.batch_size, 1);
        assertEquals(kicks[0].p_body, { batch_offset: 4 });
      },
    );

    await t.step(
      "last batch: no kick, and the pulse snapshot runs once",
      async () => {
        const { body, kicks, pulses } = await invoke(6, 4, 20_000);

        assertEquals([body.batch_size, body.has_more], [2, false]);
        assertEquals([kicks.length, pulses], [0, 1]);
      },
    );
  },
});
