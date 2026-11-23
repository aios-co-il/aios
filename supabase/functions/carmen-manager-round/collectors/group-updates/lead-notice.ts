/**
 * Lead notifications an automation posts into a client's group ("ליד מקמפיין
 * פייסבוק … שם מלא: … מס' טלפון: …"). Leads have their own reports, so these
 * are not a card update; dropping them also keeps a lead's name and phone out
 * of the model prompt and the drafted card line.
 */
const LEAD_OPENING = /^ליד(?: חדש)? מ/u;
const LEAD_FIELD = /(?:שם מלא|טלפון)\s*:/u;

/** True for an automated lead notification. */
export function isLeadNotice(text: string): boolean {
  const trimmed = text.trim();
  return LEAD_OPENING.test(trimmed) && LEAD_FIELD.test(trimmed);
}
