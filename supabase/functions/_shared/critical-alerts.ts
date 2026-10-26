/**
 * Which alerts may interrupt Shabbat (AIO-226).
 *
 * David's policy: on Saturday (Asia/Jerusalem, 00:00–23:59) no task
 * notifications and no non-critical alerts. Only these may go out:
 *  - an ad account that stopped, was disabled or stopped spending;
 *  - a lost integration connection;
 *  - leads that were not delivered (lead-alert failure).
 * Everything else is held: re-evaluated after Shabbat (pulse instant alerts) or
 * kept unsent and released on the next run (campaign_alerts WhatsApp).
 */
import { isJerusalemShabbat } from "./calendarTimeZone.ts";

export const CRITICAL_ALERT_KINDS = [
  "ad_account_stopped",
  "connection_lost",
  "lead_alert_failure",
] as const;

export type CriticalAlertKind = (typeof CRITICAL_ALERT_KINDS)[number];

/** Source-specific alert names → the critical kind they represent. */
const CRITICAL_ALIASES: Record<string, CriticalAlertKind> = {
  // fb-campaign-monitor, fireIntegrationAlert, automation triggers
  ad_account_stopped: "ad_account_stopped",
  account_disabled: "ad_account_stopped",
  ad_account_disabled: "ad_account_stopped",
  ad_account_blocked: "ad_account_stopped",
  ad_account_billing_issue: "ad_account_stopped",
  ad_account_stopped_spending: "ad_account_stopped",
  // pulse instant alerts, integration alerts
  connection_lost: "connection_lost",
  integration_disconnected: "connection_lost",
  // cron-lead-alert-failure-watch
  lead_alert_failure: "lead_alert_failure",
};

/** The critical kind for a source alert name, or null when it is not critical. */
export function criticalAlertKind(
  alertType: string | null | undefined,
): CriticalAlertKind | null {
  const key = String(alertType || "")
    .trim()
    .toLowerCase();
  return CRITICAL_ALIASES[key] ?? null;
}

export function isCriticalAlert(alertType: string | null | undefined): boolean {
  return criticalAlertKind(alertType) !== null;
}

/** True when this alert must wait because it is Shabbat and it is not critical. */
export function isAlertHeldForShabbat(
  alertType: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return isJerusalemShabbat(now) && !isCriticalAlert(alertType);
}

/** Marker stored in campaign_alerts.details when WhatsApp was held for Shabbat. */
export const CAMPAIGN_ALERT_SHABBAT_HOLD = "shabbat";

type CampaignAlertRowLike = {
  notified_at?: string | null;
  details?: Record<string, unknown> | null;
};

/**
 * A campaign_alerts row whose WhatsApp was held on Shabbat is released by the
 * first run after Shabbat that still detects the same open alert. Rows without
 * the marker (older rows, or rows that had no recipient) are never replayed.
 */
export function shouldReleaseHeldCampaignAlert(
  row: CampaignAlertRowLike | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row || row.notified_at) return false;
  if (row.details?.whatsapp_hold !== CAMPAIGN_ALERT_SHABBAT_HOLD) return false;
  return !isJerusalemShabbat(now);
}
