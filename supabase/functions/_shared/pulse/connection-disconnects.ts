/**
 * Lost connections in the pulse check (AIO-342). Each open disconnect of one
 * of the tenant's own connections (pulse_open_integration_disconnects,
 * migration 20261104120000) becomes a connection_lost alert in the run
 * message, under the pulse's own switches, recipients, dedupe and Shabbat
 * rule. Its fingerprint names the disconnect event and its dedupe window
 * reaches back to the disconnect (open_since), so each disconnect is sent
 * once, and only a reconnect followed by a new loss alerts again. A lost
 * connection is always a real connection loss, so it goes out on Shabbat.
 */
import { APP_TIME_ZONE } from "../calendarTimeZone.ts";
import type { Database } from "../database.types.ts";
import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import type { DbClient } from "../supabase-clients.ts";
import { connectionDisconnectFingerprint } from "./instant-alert-fingerprint.ts";

export type OpenIntegrationDisconnect =
  Database["public"]["Functions"]["pulse_open_integration_disconnects"]["Returns"][number];

/** The extra line for a Google connection: a Testing-mode app drops it again. */
export const GOOGLE_TESTING_NOTE =
  "אם אפליקציית Google עדיין במצב Testing, החיבור יפוג שוב תוך 7 ימים";

/**
 * The tenant's open disconnects. A failed read is logged and returns none
 * with the error, so the run still sends its other alerts.
 */
export async function loadOpenIntegrationDisconnects(
  supabase: Pick<DbClient, "rpc">,
  tenantId: string,
): Promise<{
  disconnects: Array<OpenIntegrationDisconnect>;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc(
    "pulse_open_integration_disconnects",
    { p_tenant_id: tenantId },
  );
  if (error) {
    console.error("[pulse-instant-alerts] open disconnects unavailable", {
      tenantId,
      error: error.message,
    });
    return { disconnects: [], error: error.message };
  }
  return { disconnects: data ?? [], error: null };
}

/**
 * One connection_lost alert per open disconnect, in the order read. It is
 * about the organization's connection, not a client (client_id null), and its
 * log rows are keyed by `integration:<id>` in campaign_key.
 */
export function disconnectAlertCandidates(
  disconnects: Array<OpenIntegrationDisconnect>,
): Array<PulseInstantAlertCandidate> {
  return disconnects.map((disconnect) => ({
    client_id: null,
    client_name: disconnect.provider_label,
    rule_type: "connection_lost",
    campaign_key: `integration:${disconnect.integration_id}`,
    fingerprint: connectionDisconnectFingerprint(
      disconnect.integration_id,
      disconnect.event_id,
    ),
    open_since: disconnect.disconnected_at,
    shabbat_critical: true,
    evidence: {
      integration_id: disconnect.integration_id,
      integration_type: disconnect.integration_type,
      disconnect_event_id: disconnect.event_id,
      disconnected_at: disconnect.disconnected_at,
      report_tables: disconnect.report_tables,
      shared_with_tenants: disconnect.shared_with_tenants ?? [],
    },
    line: disconnectAlertLine(disconnect),
  }));
}

/**
 * The alert's line: which connection, since when, the report tables that
 * depend on it, the agency-shared orgs that use it, and how to reconnect.
 */
export function disconnectAlertLine(
  disconnect: OpenIntegrationDisconnect,
): string {
  const account = disconnect.account_label?.trim();
  const shared = disconnect.shared_with_tenants ?? [];
  return [
    `🔌 ${disconnect.provider_label}${account ? ` (${account})` : ""} מנותק מאז ${israelDayTime(disconnect.disconnected_at)}`,
    reportTablesText(disconnect.report_tables),
    ...(shared.length ? [`משמש גם את ${shared.join(", ")}`] : []),
    `לתיקון: AIOS → אינטגרציות → ${disconnect.provider_label} → חיבור מחדש`,
    ...(isGoogleConnection(disconnect.integration_type)
      ? [GOOGLE_TESTING_NOTE]
      : []),
  ].join(" · ");
}

/** "3 טבלאות דוח תלויות בו", in the singular for one. */
function reportTablesText(count: number): string {
  if (count === 0) {
    return "אין טבלאות דוח שתלויות בו";
  }
  return count === 1
    ? "טבלת דוח אחת תלויה בו"
    : `${count} טבלאות דוח תלויות בו`;
}

/** Google connections share one OAuth app, whose Testing mode expires tokens. */
function isGoogleConnection(integrationType: string): boolean {
  return integrationType.startsWith("google_") || integrationType === "gmail";
}

/** "4.11 12:25" in Israel time. */
function israelDayTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  // en-GB pads the day and month next to a 2-digit hour; the header does not.
  return `${Number(part("day"))}.${Number(part("month"))} ${part("hour")}:${part("minute")}`;
}
