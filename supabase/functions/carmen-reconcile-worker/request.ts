/**
 * The worker's request: who may call it, its body read into typed options,
 * and the checks that refuse a call before any work (AIO-238).
 */
import { isNonProductionAppEnv } from "../_shared/app-env.ts";
import { asRecord } from "../_shared/reconcile/json.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";
import { MAX_DEFERRED } from "./chain.ts";

/** Calls one nightly chain may queue after the first. */
export const MAX_HOPS = 150;

export type WorkerRequest = {
  phase: "tables" | "retry" | "accounts";
  /** crm_tables.id in the tables and retry phases; the last fully checked tenant in the accounts phase. */
  cursor: string | null;
  hop: number;
  maxTables: number;
  apiCallBudget: number;
  tenantId: string | null;
  clientId: string | null;
  tableIds: string[] | null;
  /** Table ids passed over for a rate limit (chained calls only). */
  deferred: string[];
  /** On demand (tenant_id, client_id or table_ids): never chained past its tables. */
  scoped: boolean;
  useFixture: boolean;
  fixtures: Record<string, unknown>;
  chain: boolean;
};

/** True when the caller presents the service-role key. */
export function isServiceRequest(req: Request, serviceKey: string): boolean {
  const bearer = (req.headers.get("Authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );
  return isServiceKey(bearer, serviceKey);
}

/** The JSON body, or an empty object when there is none. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

/** The body as typed options, every number clamped to its range. */
export function parseWorkerRequest(raw: unknown): WorkerRequest {
  const body = asRecord(raw);
  const tableIds = Array.isArray(body.table_ids)
    ? body.table_ids.filter(isString)
    : null;
  return {
    phase:
      body.phase === "accounts" || body.phase === "retry"
        ? body.phase
        : "tables",
    cursor: body.cursor ? String(body.cursor) : null,
    hop: clampInt(body.hop, 0, 0, MAX_HOPS),
    maxTables: clampInt(body.max_tables, 6, 1, 25),
    apiCallBudget: clampInt(body.api_call_budget, 60, 5, 300),
    tenantId: body.tenant_id ? String(body.tenant_id) : null,
    clientId: body.client_id ? String(body.client_id) : null,
    tableIds,
    deferred: Array.isArray(body.deferred)
      ? body.deferred.filter(isString).slice(0, MAX_DEFERRED)
      : [],
    scoped: !!(body.tenant_id || body.client_id || tableIds?.length),
    useFixture: body.source === "fixture",
    fixtures: asRecord(body.fixtures),
    chain: body.chain !== false,
  };
}

/** Why the request is refused, or null when it may run. */
export function rejectInvalidRequest(
  request: WorkerRequest,
  appEnv: string | undefined,
): string | null {
  if (request.useFixture && !isNonProductionAppEnv(appEnv)) {
    return "fixture source is not allowed in production";
  }
  // Canned data stands in for one table's platform side only; across every
  // table it would write "skipped" over that night's real results.
  if (request.useFixture && !request.tableIds?.length) {
    return "fixture source needs table_ids";
  }
  // Only the unscoped nightly chain moves past the tables phase. A scoped or
  // fixture call with phase "retry" would otherwise run on body.deferred,
  // outside its table_ids, and could write canned results over real runs.
  if ((request.useFixture || request.scoped) && request.phase !== "tables") {
    return "retry and accounts phases are only for the nightly chain";
  }
  return null;
}

/** A JSON response. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** `value` as a whole number within [min, max], or `fallback` when it is not a number. */
function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(Math.max(n, min), max);
}

/** Type guard for string ids in a parsed body. */
function isString(value: unknown): value is string {
  return typeof value === "string";
}
