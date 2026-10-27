/**
 * Client-call freshness for the campaign pulse (AIO-227).
 *
 * "No call logged" is a contact indicator kept apart from the campaign status.
 * The status reflects campaign performance and data only, so a client with good
 * results and no logged call stays healthy and is flagged separately.
 * Shared by campaign-pulse-snapshot, Carmen's get_latest_campaign_pulse and the
 * DMM pulse dashboard so all three use the same 14-day rule.
 */

export const CLIENT_CALL_STALE_DAYS = 14;
export const CLIENT_CALL_STALE_MS =
  CLIENT_CALL_STALE_DAYS * 24 * 60 * 60 * 1000;

/** Short label for the separate contact indicator. */
export const NO_RECENT_CLIENT_CALL_LABEL = "ללא שיחה מתועדת";
/** Full wording for digests and Carmen's output. */
export const NO_RECENT_CLIENT_CALL_TEXT = `${NO_RECENT_CLIENT_CALL_LABEL} ב-${CLIENT_CALL_STALE_DAYS} הימים האחרונים`;

type PulseRowCallFields = {
  flags?: unknown;
  last_client_call_at?: string | null;
  no_recent_client_call?: boolean | null;
};

type PulseRowWithCall = PulseRowCallFields & {
  status?: string | null;
  lead_goal_status?: string | null;
  ecommerce_goal_status?: string | null;
};

/**
 * true: no client call logged in the last 14 days, or none at all.
 * false: a call was logged within 14 days.
 * null: call data was unavailable (undefined input), so nothing is claimed.
 */
export function resolveNoRecentClientCall(
  lastClientCallAt: string | null | undefined,
  nowMs = Date.now(),
): boolean | null {
  if (lastClientCallAt === undefined) {
    return null;
  }
  if (!lastClientCallAt) {
    return true;
  }
  const timestamp = new Date(lastClientCallAt).getTime();
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return nowMs - timestamp > CLIENT_CALL_STALE_MS;
}

/**
 * Flag text that snapshots written before AIO-227 stored in `flags`. On those
 * rows the call gap alone could turn a healthy client into a warning.
 */
export function isLegacyClientCallFlag(flag: unknown): boolean {
  const text = String(flag ?? "").trim();
  return text.startsWith("לא תועדה שיחה") || /שיחה טלפונית עם הלקוח/.test(text);
}

/** Whether a pulse row lacks a recent client call (explicit field first, then legacy flag text). */
export function pulseRowHasNoRecentClientCall(
  row: PulseRowCallFields,
): boolean {
  if (typeof row.no_recent_client_call === "boolean") {
    return row.no_recent_client_call;
  }
  return (Array.isArray(row.flags) ? row.flags : []).some(
    isLegacyClientCallFlag,
  );
}

/**
 * Give a stored pulse row the separate `no_recent_client_call` indicator and
 * remove the call gap from its status and flags (see stripLegacyClientCallFlag).
 * Rows written after AIO-227 only gain the indicator.
 */
export function normalizePulseRowClientCall<T extends PulseRowWithCall>(
  row: T,
  nowMs = Date.now(),
): T & { no_recent_client_call: boolean | null } {
  return {
    ...stripLegacyClientCallFlag(row),
    no_recent_client_call: resolveRowNoRecentClientCall(row, nowMs),
  };
}

/**
 * Drop the legacy call flag from a row written before AIO-227. A warning that
 * only that flag explained goes back to healthy; rows without it are returned as is.
 */
export function stripLegacyClientCallFlag<T extends PulseRowWithCall>(
  row: T,
): T {
  const allFlags = Array.isArray(row.flags) ? row.flags.map(String) : [];
  const flags = allFlags.filter((flag) => !isLegacyClientCallFlag(flag));
  if (flags.length === allFlags.length) {
    return row;
  }
  const restore = (status: string | null | undefined) =>
    status === "warning" && flags.length === 0 ? "healthy" : status;
  return {
    ...row,
    flags,
    status: restore(row.status),
    lead_goal_status: restore(row.lead_goal_status),
    ecommerce_goal_status: restore(row.ecommerce_goal_status),
  };
}

/**
 * The stored call date decides when it was loaded. Without it only legacy flag
 * text can claim a gap; otherwise the indicator stays null (unknown).
 */
function resolveRowNoRecentClientCall(
  row: PulseRowCallFields,
  nowMs: number,
): boolean | null {
  if (typeof row.no_recent_client_call === "boolean") {
    return row.no_recent_client_call;
  }
  if (row.last_client_call_at !== undefined) {
    return resolveNoRecentClientCall(row.last_client_call_at, nowMs);
  }
  return pulseRowHasNoRecentClientCall(row) ? true : null;
}
