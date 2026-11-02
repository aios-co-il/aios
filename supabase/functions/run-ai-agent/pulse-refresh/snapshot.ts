import { asUuidOrNull } from "../../_shared/uuid.ts";
import type { PulseRefreshStatus } from "./note.ts";

/** At most one refresh per tenant in this window; a newer snapshot is fresh. */
export const PULSE_REFRESH_MIN_INTERVAL_SECONDS = 600;

const PULSE_REFRESH_SOURCE = "carmen_refresh_tool";

/** campaign-pulse-snapshot's request body for one tenant. */
export type PulseRefreshRequestBody = {
  tenant_id: string;
  deliver: false;
  skip_instant_alerts: true;
  preview_only: true;
  source: string;
};

/** The snapshot call's HTTP answer; body is the parsed JSON or null. */
export type SnapshotResponse = { ok: boolean; status?: number; body: unknown };

/** What the snapshot run means for this tenant. */
export type SnapshotOutcome =
  | { status: Extract<PulseRefreshStatus, "refreshed">; clients: number | null }
  | { status: Extract<PulseRefreshStatus, "refresh_failed">; error: string }
  | { status: Extract<PulseRefreshStatus, "not_configured"> };

/** campaign-pulse-snapshot body: one tenant, no digest, no instant alerts. */
export function buildPulseRefreshRequestBody(
  tenantId: string | null | undefined,
): PulseRefreshRequestBody {
  const id = asUuidOrNull(tenantId);
  // Without tenant_id the snapshot recomputes every tenant.
  if (!id) {
    throw new Error("tenant_id must be a uuid");
  }
  return {
    tenant_id: id,
    deliver: false,
    skip_instant_alerts: true,
    preview_only: true,
    source: PULSE_REFRESH_SOURCE,
  };
}

/** A snapshot computed inside the interval is fresh enough to return as is. */
export function decidePulseRefresh({
  lastCalculatedAt,
  now,
  minIntervalSeconds = PULSE_REFRESH_MIN_INTERVAL_SECONDS,
}: {
  lastCalculatedAt: string | null | undefined;
  now: Date;
  minIntervalSeconds?: number;
}):
  | { refresh: false; reason: "fresh_snapshot" }
  | { refresh: true; reason: null } {
  const last = Date.parse(lastCalculatedAt ?? "");
  if (
    Number.isFinite(last) &&
    now.getTime() - last < minIntervalSeconds * 1000
  ) {
    return { refresh: false, reason: "fresh_snapshot" };
  }
  return { refresh: true, reason: null };
}

/** Reads the snapshot function's answer for this tenant. */
export function interpretPulseSnapshotResponse(
  tenantId: string,
  response: SnapshotResponse | null | undefined,
): SnapshotOutcome {
  const body = isObject(response?.body) ? response.body : {};
  const results = Array.isArray(body.results) ? body.results : null;
  const mine = results?.find(
    (row): row is Record<string, unknown> =>
      isObject(row) && row.tenant_id === tenantId,
  );
  if (mine?.error) {
    return { status: "refresh_failed", error: shortError(mine.error) };
  }
  if (mine) {
    return {
      status: "refreshed",
      clients:
        typeof mine.clients === "number" && Number.isFinite(mine.clients)
          ? mine.clients
          : null,
    };
  }
  if (!response?.ok) {
    return {
      status: "refresh_failed",
      error: shortError(body.error || `HTTP ${response?.status ?? "?"}`),
    };
  }
  // A 200 without the results list (an unreadable body) says nothing about
  // this tenant, so it is a failed refresh, not a missing pulse setting.
  if (!results) {
    return {
      status: "refresh_failed",
      error: "campaign-pulse-snapshot answered without results",
    };
  }
  // No tenant_heartbeat_settings row: the snapshot has nothing to compute.
  return { status: "not_configured" };
}

/** Error text kept in the tool result, capped at 300 characters. */
export function shortError(value: unknown): string {
  return String(value ?? "").slice(0, 300);
}

/** Objects and arrays, as the snapshot's JSON may hold either. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
