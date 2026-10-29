/**
 * pulse_alert_rules.unanswered_reply_hours: the business hours a client's
 * message in a linked group or a private chat may wait for a staff reply
 * before Carmen's manager round flags it (unanswered_request, AIO-252). It sits at
 * the top level next to the pulse checks, so whoever edits those edits it too
 * (the manager block is owner-only). The alert rules dialog
 * (src/lib/pulseAlertRules.ts) and the round (_shared/manager-round/settings.ts)
 * both read it through this module.
 */

export const DEFAULT_UNANSWERED_REPLY_HOURS = 3;

/** The fewest hours a tenant may set; a smaller positive value is raised to it. */
export const MIN_UNANSWERED_REPLY_HOURS = 1;

/** The stored hours (at least the minimum), or the default for anything that is not a positive number. */
export function resolveUnansweredReplyHours(raw: unknown): number {
  const hours = Number(raw);
  return Number.isFinite(hours) && hours > 0
    ? Math.max(MIN_UNANSWERED_REPLY_HOURS, hours)
    : DEFAULT_UNANSWERED_REPLY_HOURS;
}
