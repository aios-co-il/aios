// How a mailing blacklist entry (broadcast_opt_outs.source) came to be.

/** Labels for the blacklist screen; unknown sources show as stored. */
export const BLACKLIST_SOURCE_LABELS: Record<string, string> = {
  unsubscribe_link: "קישור הסרה",
  email_unsubscribe: "קישור הסרה (מייל)",
  whatsapp_reply: "ביקש הסרה בוואטסאפ",
  spam_complaint: "דיווח ספאם (מייל)",
  manual: "ידני",
};

/** Sources where the contact asked to stop, so unblocking needs a warning. */
const SELF_UNSUBSCRIBE_SOURCES = new Set([
  "unsubscribe_link",
  "email_unsubscribe",
  "whatsapp_reply",
  "spam_complaint",
]);

/** Did the contact remove themselves (link, one-click, reply or complaint)? */
export function isSelfUnsubscribe(source: string | null) {
  return SELF_UNSUBSCRIBE_SOURCES.has(source ?? "");
}
