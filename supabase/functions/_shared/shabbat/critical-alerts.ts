/**
 * Which alerts may interrupt Shabbat (AIO-226). Pulse instant alerts and the
 * campaign status alerts (Meta monitor, Google check) consult this list; add a
 * new critical source name here.
 */
import { isJerusalemShabbat } from "./quiet-window.ts";

/**
 * David's three critical kinds, by the names their sources use. Names that
 * nothing in this repo sends to the two consumers stay: campaign_alerts rows
 * also come from outside the repo, and dropping a name would hold its alert.
 */
const SHABBAT_CRITICAL_ALERT_TYPES = new Set([
  // An ad account that stopped, was disabled or stopped spending.
  "ad_account_stopped",
  "account_disabled",
  "ad_account_disabled",
  "ad_account_blocked",
  "ad_account_billing_issue",
  "ad_account_stopped_spending",
  // A lost integration connection.
  "connection_lost",
  "integration_disconnected",
  // Leads that were not delivered.
  "lead_alert_failure",
]);

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
  return SHABBAT_CRITICAL_ALERT_TYPES.has(
    (alertType ?? "").trim().toLowerCase(),
  );
}
