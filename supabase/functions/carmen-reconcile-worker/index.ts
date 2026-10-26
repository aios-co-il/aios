/**
 * carmen-reconcile-worker — nightly reconciliation of AIOS ad reports against
 * Meta and Google (AIO-238). Report-only: writes reconcile_runs and
 * reconcile_findings, never sends a message.
 *
 * Service role only. The nightly cron (01:30 UTC) calls it with no body; each
 * call reconciles a chunk of tables and queues the next chunk through
 * kick_internal_function until every table is done, then checks for Meta ad
 * accounts with spend that no client is mapped to.
 *
 * Body (all optional):
 *   cursor            continue after this crm_tables.id
 *   phase             "tables" (default) | "accounts"
 *   tenant_id, client_id, table_ids   on-demand scope (no chaining, no accounts phase)
 *   max_tables        tables per call (default 6, max 25)
 *   api_call_budget   platform requests per call (default 60, max 300)
 *   source: "fixture" + fixtures      canned platform data, non-production only;
 *                     needs table_ids, so it never overwrites other tables' results
 *
 * In the "tables" phase `cursor` is a crm_tables.id; in the "accounts" phase it
 * is the last tenant whose Meta connections were fully checked.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { isNonProductionAppEnv } from "../_shared/app-env.ts";
import { kickNextBatch } from "../_shared/kick-next-batch.ts";
import {
  CallBudget,
  createFixtureSource,
  type FixtureTable,
  type PlatformSource,
  platformFor,
  type ReconcileTable,
} from "../_shared/reconcile-core.ts";
import {
  listMappedMetaAccounts,
  listReconcileTables,
  latestRunForTable,
  nextMetaConnectionTenant,
  pruneReconcileRuns,
  readAiosCampaignRows,
  resolveGoogleAuth,
  resolveMetaToken,
  saveReconcileRun,
} from "../_shared/reconcile-db.ts";
import {
  type ReconcileStore,
  type ResyncTrigger,
  runReconcileChunk,
  runUnmappedAccountsCheck,
} from "../_shared/reconcile-runner.ts";
import {
  createGoogleSource,
  createMetaSource,
  listMetaAccountsWithSpend,
} from "../_shared/reconcile-sources.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";

const FUNCTION_NAME = "carmen-reconcile-worker";
const DEADLINE_MS = 110_000;
const MAX_HOPS = 150;
const RETENTION_DAYS = 90;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const clampInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

// sync-facebook-insights is left out on purpose: it ignores the window (see
// RESYNC_INTEGRATION_TYPES in reconcile-runner.ts).
const SYNC_FUNCTION: Record<string, string> = {
  google_ads: "sync-google-ads-data",
  facebook_ecommerce: "sync-facebook-ecommerce",
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const bearer = (req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!isServiceKey(bearer, serviceKey))
    return json({ error: "unauthorized" }, 401);

  let body: Record<string, any> = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const appEnv = Deno.env.get("APP_ENV");
  const startedMs = Date.now();
  const deadline = startedMs + DEADLINE_MS;
  const budget = new CallBudget(clampInt(body.api_call_budget, 60, 5, 300));
  const maxTables = clampInt(body.max_tables, 6, 1, 25);
  const hop = clampInt(body.hop, 0, 0, MAX_HOPS);
  const phase = body.phase === "accounts" ? "accounts" : "tables";
  const tableIds = Array.isArray(body.table_ids)
    ? body.table_ids.filter((id: unknown) => typeof id === "string")
    : null;
  const scoped = !!(body.tenant_id || body.client_id || tableIds?.length);
  const useFixture = body.source === "fixture";

  if (useFixture && !isNonProductionAppEnv(appEnv))
    return json({ error: "fixture source is not allowed in production" }, 400);
  // Canned data stands in for one table's platform side only; across every
  // table it would write "skipped" over that night's real results.
  if (useFixture && !tableIds?.length)
    return json({ error: "fixture source needs table_ids" }, 400);

  const google = {
    developerToken: Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "",
    clientId: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
    clientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
  };

  let fixtureSource: PlatformSource | null = null;
  if (useFixture) {
    fixtureSource = createFixtureSource(
      (body.fixtures || {}) as Record<string, FixtureTable>,
      appEnv,
    );
  }
  const meta = createMetaSource({
    getToken: (table) => resolveMetaToken(db, table),
    budget,
  });
  const googleSource = createGoogleSource({
    getAuth: (table) => resolveGoogleAuth(db, table, google, budget),
    budget,
  });
  const sourceFor = (table: ReconcileTable): PlatformSource => {
    if (fixtureSource) return fixtureSource;
    return platformFor(table.integration_type) === "google"
      ? googleSource
      : meta;
  };

  const store: ReconcileStore = {
    listTables: ({ afterId, limit }) =>
      listReconcileTables(db, {
        afterId,
        limit,
        tenantIds: body.tenant_id ? [String(body.tenant_id)] : null,
        clientId: body.client_id ? String(body.client_id) : null,
        tableIds,
      }),
    readAios: (table, start, end) =>
      readAiosCampaignRows(db, table.id, start, end),
    latestRun: (tableId) => latestRunForTable(db, tableId),
    saveRun: (run, findings) => saveReconcileRun(db, run, findings),
  };

  // Re-fetch the window through the table's own sync function. Fixture runs
  // never touch real syncs.
  const triggerResync: ResyncTrigger | undefined = useFixture
    ? undefined
    : async (table, window) => {
        const fn = SYNC_FUNCTION[table.integration_type];
        if (!fn) return { queued: false, error: "no sync function" };
        const task = fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            "x-internal-cron": "true",
          },
          body: JSON.stringify({
            table_id: table.id,
            start_date: window.start,
            end_date: window.end,
            update_last_sync: false,
            _internal_cron: true,
          }),
        })
          .then((res) => {
            console.log(`[reconcile] resync ${fn} ${table.id}: ${res.status}`);
          })
          .catch((err) =>
            console.error(`[reconcile] resync ${fn} ${table.id} failed:`, err),
          );
        // The sync can outlive this call; keep the isolate alive for it.
        const runtime = (
          globalThis as {
            EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
          }
        ).EdgeRuntime;
        if (runtime?.waitUntil) runtime.waitUntil(task);
        // Fire-and-forget: only the request is known, not the sync's outcome.
        return { queued: true };
      };

  try {
    if (!scoped && phase === "tables" && !body.cursor && hop === 0) {
      const before = new Date(
        Date.now() - RETENTION_DAYS * 86_400_000,
      ).toISOString();
      await pruneReconcileRuns(db, before);
    }

    let next: Record<string, unknown> | null = null;
    let result: Record<string, unknown>;

    if (phase === "tables") {
      const chunk = await runReconcileChunk(
        {
          store,
          sourceFor,
          budget,
          now: () => new Date(),
          deadline,
          triggerResync,
          log: (m) => console.log(m),
        },
        { cursor: body.cursor ? String(body.cursor) : null, maxTables },
      );
      result = { phase, ...chunk };
      if (!chunk.done) next = { phase: "tables", cursor: chunk.next_cursor };
      else if (!scoped && !useFixture)
        next = { phase: "accounts", cursor: null };
    } else {
      const mapped = await listMappedMetaAccounts(db);
      const check = await runUnmappedAccountsCheck({
        cursor: body.cursor ? String(body.cursor) : null,
        nextTenant: (after) => nextMetaConnectionTenant(db, after),
        mapped,
        listAccounts: (token) => listMetaAccountsWithSpend({ token, budget }),
        saveRun: (run, findings) => saveReconcileRun(db, run, findings),
        budget,
        now: () => new Date(),
        deadline,
      });
      result = { phase, ...check, api_calls: budget.used };
      if (!check.done) next = { phase: "accounts", cursor: check.next_cursor };
    }

    const chain = !scoped && !useFixture && body.chain !== false;
    if (next && chain && hop < MAX_HOPS) {
      await kickNextBatch(db, FUNCTION_NAME, {
        ...next,
        hop: hop + 1,
        max_tables: maxTables,
        api_call_budget: budget.limit,
      });
      result.queued_next = next;
    } else if (next && chain) {
      console.warn(`[reconcile] stopped after ${hop} hops`);
      result.hop_limit_reached = true;
    }
    return json({
      ok: true,
      hop,
      elapsed_ms: Date.now() - startedMs,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile] worker failed:", message);
    return json({ ok: false, error: "reconcile worker failed" }, 500);
  }
});
