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

/**
 * true: no client call logged in the last 14 days, or none at all.
 * false: a call was logged within 14 days.
 * null: call data was unavailable (undefined input), so nothing is claimed.
 */
export function resolveNoRecentClientCall(
  lastClientCallAt: string | null | undefined,
  nowMs = Date.now(),
): boolean | null {
  if (lastClientCallAt === undefined) return null;
  if (!lastClientCallAt) return true;
  const timestamp = new Date(lastClientCallAt).getTime();
  if (Number.isNaN(timestamp)) return true;
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

type PulseRowCallFields = {
  flags?: unknown;
  last_client_call_at?: string | null;
  no_recent_client_call?: boolean | null;
};

/** Whether a pulse row lacks a recent client call (explicit field first, then legacy flag text). */
export function pulseRowHasNoRecentClientCall(
  row: PulseRowCallFields,
): boolean {
  if (typeof row.no_recent_client_call === "boolean")
    return row.no_recent_client_call;
  return (Array.isArray(row.flags) ? row.flags : []).some(
    isLegacyClientCallFlag,
  );
}

type PulseRowWithCall = PulseRowCallFields & {
  status?: string | null;
  lead_goal_status?: string | null;
  ecommerce_goal_status?: string | null;
};

/**
 * Give a stored pulse row the separate `no_recent_client_call` indicator and
 * remove the call gap from its status and flags. Rows written before AIO-227
 * lose the legacy call flag, and a warning that only that flag explained goes
 * back to healthy. Rows written after it only gain the indicator.
 */
export function normalizePulseRowClientCall<T extends PulseRowWithCall>(
  row: T,
  nowMs = Date.now(),
): T & { no_recent_client_call: boolean | null } {
  const allFlags = Array.isArray(row.flags) ? row.flags.map(String) : [];
  const flags = allFlags.filter((flag) => !isLegacyClientCallFlag(flag));
  const hadLegacyCallFlag = flags.length !== allFlags.length;
  let noRecentClientCall: boolean | null;
  if (typeof row.no_recent_client_call === "boolean") {
    noRecentClientCall = row.no_recent_client_call;
  } else if (row.last_client_call_at !== undefined) {
    noRecentClientCall = resolveNoRecentClientCall(
      row.last_client_call_at,
      nowMs,
    );
  } else {
    noRecentClientCall = hadLegacyCallFlag ? true : null;
  }
  if (!hadLegacyCallFlag) {
    return { ...row, no_recent_client_call: noRecentClientCall };
  }
  const restore = <S extends string | null | undefined>(status: S): S =>
    (status === "warning" && flags.length === 0 ? "healthy" : status) as S;
  return {
    ...row,
    flags,
    status: restore(row.status),
    lead_goal_status: restore(row.lead_goal_status),
    ecommerce_goal_status: restore(row.ecommerce_goal_status),
    no_recent_client_call: noRecentClientCall,
  };
}
