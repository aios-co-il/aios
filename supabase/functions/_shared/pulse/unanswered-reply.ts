/**
 * pulse_alert_rules.unanswered_reply_hours: the business hours a client's
 * message in a group linked to the client may wait for a staff reply before
 * Carmen's manager round flags it (unanswered_request, AIO-252). It sits at
 * the top level next to the pulse checks, so whoever edits those edits it too
 * (the manager block is owner-only). The alert rules dialog
 * (src/lib/pulseAlertRules.ts) and the round (_shared/manager-round/settings.ts)
 * both read it through this module.
 */

export const DEFAULT_UNANSWERED_REPLY_HOURS = 3;

/** The stored hours (at least 1), or the default for anything that is not a positive number. */
export function resolveUnansweredReplyHours(raw: unknown): number {
  const hours = Number(raw);
  return Number.isFinite(hours) && hours > 0
    ? Math.max(1, hours)
    : DEFAULT_UNANSWERED_REPLY_HOURS;
}
