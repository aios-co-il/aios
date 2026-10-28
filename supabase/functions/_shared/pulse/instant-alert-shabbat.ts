import type { PulseInstantAlertCandidate } from "../pulse-instant-alerts.ts";
import { isAlertHeldForShabbat } from "../shabbat/critical-alerts.ts";
import { isJerusalemShabbat } from "../shabbat/quiet-window.ts";

/**
 * Shabbat policy for one pulse instant alert (AIO-226): non-critical rules
 * wait, and so does a connection_lost that is only single-campaign issues
 * (shabbat_critical false). Held alerts are not logged, so the first run after
 * Shabbat re-evaluates and sends them once.
 */
export function isPulseAlertHeldForShabbat(
  candidate: Pick<PulseInstantAlertCandidate, "rule_type" | "shabbat_critical">,
  now: Date = new Date(),
): boolean {
  if (!isJerusalemShabbat(now)) {
    return false;
  }
  return (
    isAlertHeldForShabbat(candidate.rule_type, now) ||
    candidate.shabbat_critical !== true
  );
}
