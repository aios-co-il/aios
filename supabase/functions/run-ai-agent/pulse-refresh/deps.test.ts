import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { createPulseRefreshDeps } from "./deps.ts";
import { CLIENT, fakeDeps, OTHER_TENANT, TENANT, USER } from "./fake-deps.ts";
import { runCampaignPulseRefresh } from "./run.ts";
import { buildPulseRefreshRequestBody } from "./snapshot.ts";

type Query = {
  table: string;
  columns?: string;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  order?: [string, unknown];
  limit?: number;
};

/** A Supabase stand-in whose every query answers `answer`; it records queries and RPCs. */
function fakeSupabase(answer: { data: unknown; error: unknown }) {
  const queries: Query[] = [];
  const rpcs: Array<[string, unknown]> = [];
  const supabase = {
    from(table: string) {
      const q: Query = { table, eq: [], in: [] };
      queries.push(q);
      const chain = {
        select: (columns: string) => ((q.columns = columns), chain),
        eq: (column: string, value: unknown) => (
          q.eq.push([column, value]),
          chain
        ),
        in: (column: string, values: unknown[]) => (
          q.in.push([column, values]),
          chain
        ),
        order: (column: string, opts: unknown) => (
          (q.order = [column, opts]),
          chain
        ),
        limit: (n: number) => ((q.limit = n), chain),
        maybeSingle: async () => answer,
      };
      return chain;
    },
    rpc: async (name: string, params: unknown) => {
      rpcs.push([name, params]);
      return { data: true, error: null };
    },
  };
  return { supabase, queries, rpcs };
}

/** The error message `fn` rejects with, or null when it resolves. */
async function rejection(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

Deno.test("createPulseRefreshDeps", async (t) => {
  await t.step(
    "Supabase deps: tenant-scoped reads, the claim RPC and a service-role POST",
    async () => {
      const { supabase, queries, rpcs } = fakeSupabase({
        data: { calculated_at: "2026-10-26T04:00:00Z" },
        error: null,
      });
      const fetched: Array<[string, RequestInit]> = [];
      const deps = createPulseRefreshDeps({
        supabase,
        tenantId: TENANT,
        requestedBy: USER,
        supabaseUrl: "https://example.supabase.co/",
        serviceKey: "service-key",
        fetchImpl: async (url, init) => {
          fetched.push([String(url), init ?? {}]);
          return Response.json({
            results: [{ tenant_id: TENANT, clients: 1 }],
          });
        },
      });
      assertStrictEquals(
        await deps.latestCalculatedAt(),
        "2026-10-26T04:00:00Z",
      );
      assertEquals(queries[0].eq, [["tenant_id", TENANT]]);
      assertStrictEquals(queries[0].table, "campaign_pulse_snapshots");
      assertStrictEquals(await deps.claimRefresh(600), true);
      assertEquals(rpcs, [
        [
          "claim_campaign_pulse_refresh",
          {
            p_tenant_id: TENANT,
            p_min_interval_seconds: 600,
            p_requested_by: USER,
          },
        ],
      ]);
      const response = await deps.invokeSnapshot(
        buildPulseRefreshRequestBody(TENANT),
      );
      assertStrictEquals(response.ok, true);
      const [url, init] = fetched[0];
      assertStrictEquals(
        url,
        "https://example.supabase.co/functions/v1/campaign-pulse-snapshot",
      );
      assertStrictEquals(init.method, "POST");
      assertEquals(
        new Headers(init.headers).get("Authorization"),
        "Bearer service-key",
      );
      const body = JSON.parse(String(init.body));
      assertStrictEquals(body.deliver, false);
      assertStrictEquals(body.skip_instant_alerts, true);
      assertStrictEquals(body.tenant_id, TENANT);
      assert(init.signal, "the call has a timeout");
    },
  );

  await t.step(
    "Supabase deps: a client must sit in an accessible tenant and pass the caller scope",
    async () => {
      const scopeChecks: string[] = [];
      const accessibleTenantIds = [TENANT, OTHER_TENANT];
      const found = fakeSupabase({ data: { id: CLIENT }, error: null });
      const visible = createPulseRefreshDeps({
        supabase: found.supabase,
        tenantId: TENANT,
        accessibleTenantIds,
        assertCallerCanAccessClient: async (clientId) => {
          scopeChecks.push(clientId);
        },
      });
      await visible.assertClientVisible(CLIENT);
      assertStrictEquals(found.queries[0].table, "clients");
      assertEquals(found.queries[0].eq, [["id", CLIENT]]);
      assertEquals(found.queries[0].in, [["tenant_id", accessibleTenantIds]]);
      assertEquals(scopeChecks, [CLIENT]);

      // A campaigner's scope check refuses a client that is not theirs.
      const notMine = createPulseRefreshDeps({
        supabase: found.supabase,
        tenantId: TENANT,
        accessibleTenantIds,
        assertCallerCanAccessClient: async () => {
          throw new Error("הלקוח לא משויך אליך");
        },
      });
      const refused = await runCampaignPulseRefresh(
        { tenantId: TENANT, clientId: CLIENT },
        {
          ...fakeDeps().deps,
          assertClientVisible: notMine.assertClientVisible,
        },
      );
      assertEquals(refused, {
        error: "client_not_accessible",
        message: "הלקוח לא משויך אליך",
      });

      // A client outside every accessible tenant never reaches the scope check.
      scopeChecks.length = 0;
      const missing = createPulseRefreshDeps({
        supabase: fakeSupabase({ data: null, error: null }).supabase,
        tenantId: TENANT,
        accessibleTenantIds,
        assertCallerCanAccessClient: async (clientId) => {
          scopeChecks.push(clientId);
        },
      });
      assertStrictEquals(
        await rejection(() => missing.assertClientVisible(CLIENT)),
        "הלקוח לא נמצא או מחוץ להרשאה שלך",
      );
      assertEquals(scopeChecks, []);

      // Without a scope check the client is refused, never allowed by default.
      const unchecked = createPulseRefreshDeps({
        supabase: found.supabase,
        tenantId: TENANT,
      });
      assert(
        await rejection(() => unchecked.assertClientVisible(CLIENT)),
        "missing scope check refuses",
      );
    },
  );

  await t.step(
    "a failed client lookup is reported as a failed check, not a missing client",
    async () => {
      const scopeChecks: string[] = [];
      const deps = createPulseRefreshDeps({
        supabase: fakeSupabase({
          data: null,
          error: { message: "permission denied for table clients" },
        }).supabase,
        tenantId: TENANT,
        assertCallerCanAccessClient: async (clientId) => {
          scopeChecks.push(clientId);
        },
      });
      const errors: unknown[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => errors.push(args);
      try {
        // The Postgres text stays in the log, never in the tool result.
        assertStrictEquals(
          await rejection(() => deps.assertClientVisible(CLIENT)),
          "לא ניתן לבדוק הרשאה ללקוח",
        );
      } finally {
        console.error = original;
      }
      assertStrictEquals(errors.length, 1);
      assertEquals(scopeChecks, []);
    },
  );

  await t.step("a snapshot call without URL or key never fetches", async () => {
    let fetches = 0;
    const deps = createPulseRefreshDeps({
      supabase: fakeSupabase({ data: null, error: null }).supabase,
      tenantId: TENANT,
      fetchImpl: async () => {
        fetches += 1;
        return Response.json({});
      },
    });
    await assertRejects(
      () => deps.invokeSnapshot(buildPulseRefreshRequestBody(TENANT)),
      Error,
      "campaign-pulse-snapshot is not configured",
    );
    assertStrictEquals(fetches, 0);
  });
});
