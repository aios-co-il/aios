/**
 * Who may call the round and what a call may ask for. Only the service role
 * (the cron, or an operator with the key) runs it. Body fields: tenant_id,
 * client_id, collectors[], dry_run, fixtures. Fixtures (and their fake clock,
 * fixtures.now) are refused unless APP_ENV is a non-production value, and they
 * always make the call a dry run: nothing is written or sent.
 */
import { isNonProductionAppEnv } from "../_shared/app-env.ts";
import { bearerToken } from "../_shared/automation-run-auth.ts";
import type { Json } from "../_shared/database.types.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";

export type RoundRequest = {
  tenantId: string | null;
  clientId: string | null;
  collectorIds: string[] | null;
  dryRun: boolean;
  fixtures: Json | null;
  now: Date | null;
};

export type ParsedRequest =
  | { ok: true; request: RoundRequest }
  | { ok: false; status: 400 | 403; error: string };

/**
 * True when the Authorization header carries the service-role key
 * (constant-time compare). Like every caller of bearerToken, the key is
 * accepted with or without the "Bearer " prefix.
 */
export function isServiceCaller(req: Request, serviceKey: string): boolean {
  return isServiceKey(
    bearerToken(req.headers.get("Authorization")),
    serviceKey,
  );
}

/** Validates the body; refuses fixtures in Production and makes them a dry run elsewhere. */
export function parseRoundRequest(
  body: unknown,
  appEnv: string | undefined,
): ParsedRequest {
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? Object.entries(body)
      : [];
  const field = (key: string) => input.find(([name]) => name === key)?.[1];
  const tenantId = asUuidOrNull(field("tenant_id"));
  const clientId = asUuidOrNull(field("client_id"));
  if ((field("tenant_id") && !tenantId) || (field("client_id") && !clientId)) {
    return { ok: false, status: 400, error: "invalid_id" };
  }
  if (clientId && !tenantId) {
    return { ok: false, status: 400, error: "client_id_needs_tenant_id" };
  }
  const collectors = field("collectors");
  if (collectors !== undefined && !isStringList(collectors)) {
    return { ok: false, status: 400, error: "invalid_collectors" };
  }
  const fixtures = toJson(field("fixtures")) ?? null;
  if (fixtures !== null && !isNonProductionAppEnv(appEnv)) {
    return { ok: false, status: 403, error: "fixtures_refused" };
  }
  return {
    ok: true,
    request: {
      tenantId,
      clientId,
      collectorIds: collectors ?? null,
      dryRun: field("dry_run") === true || fixtures !== null,
      fixtures,
      now: fixtureNow(fixtures),
    },
  };
}

/** True for an array of strings. */
function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** fixtures.now: a fake clock for dry runs outside Production. */
function fixtureNow(fixtures: Json | null): Date | null {
  if (!fixtures || typeof fixtures !== "object" || Array.isArray(fixtures)) {
    return null;
  }
  const now = fixtures.now;
  return typeof now === "string" && !Number.isNaN(Date.parse(now))
    ? new Date(now)
    : null;
}

/** A parsed request body value as Json (undefined for anything JSON cannot hold). */
function toJson(value: unknown): Json | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJson(item) ?? null);
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJson(item)]),
    );
  }
  return undefined;
}
