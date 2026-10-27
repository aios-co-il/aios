/**
 * Which alerts may interrupt Shabbat (AIO-226).
 *
 * David's policy: on Saturday (Asia/Jerusalem, 00:00–23:59) no task
 * notifications and no non-critical alerts. Only these may go out:
 *  - an ad account that stopped, was disabled or stopped spending;
 *  - a lost integration connection;
 *  - leads that were not delivered (lead-alert failure).
 * Pulse instant alerts and fb-campaign-monitor consult this list.
 */
import { isJerusalemShabbat } from "./quiet-window.ts";

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

/** True when this alert must wait because it is Shabbat and it is not critical. */
export function isAlertHeldForShabbat(
  alertType: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return isJerusalemShabbat(now) && !isShabbatCriticalAlert(alertType);
}

/** True when the alert may go out on Shabbat. */
export function isShabbatCriticalAlert(
  alertType: string | null | undefined,
): boolean {
  return criticalAlertKind(alertType) !== null;
}

/** The critical kind for a source alert name, or null when it is not critical. */
export function criticalAlertKind(
  alertType: string | null | undefined,
): CriticalAlertKind | null {
  const key = (alertType ?? "").trim().toLowerCase();
  return CRITICAL_ALIASES[key] ?? null;
}
