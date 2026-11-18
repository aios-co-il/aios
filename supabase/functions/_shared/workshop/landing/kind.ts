/**
 * What marks a landing page project. No imports, so the planning code (defaults.ts) and the
 * workshop UI can read it without pulling in the tools.
 */

/** payload.project_type and target_channel of a landing page project. */
export const LANDING_PROJECT_TYPE = "landing";
/** The department (departments.ts) landing page projects are listed under. */
export const LANDING_DEPARTMENT = "web";

// JS \b does not see Hebrew letters, so the Hebrew phrases are matched as they are written.
const LANDING_WORDS =
  /עמוד(?:י)?\s+ה?נחיתה|דף\s+ה?נחיתה|דפי\s+ה?נחיתה|בניית\s+אתרים|לנדינג|\blanding\s*page/gi;

// What comes right before a landing page that is only where something else leads ("מודעה לקידום
// עמוד נחיתה"), and right after one that only describes something else ("landing page promo video").
// Both look on the page's own line only: the next line of a brief is another subject.
const LEADS_TO_IT =
  /(?:לקידום|לקדם|שמקדם\S*|שמקדמת|שמוביל\S*\s+ל|שמפנה\s+ל|שמקשר\S*\s+ל|עם\s+קישור\s+ל|\bpromot\w*|\blink(?:s|ing)?\s+to\s+(?:an?|the|our|my)|\bfor\s+(?:an?|the|our|my))[^\S\n]*$/i;
const DESCRIBES_OTHER = /^[^\S\n]*(?:promo|video|ads?|banner)\b/i;

/**
 * The request asks for a landing page as its deliverable. It names one; the page is not just what
 * another deliverable promotes or describes; and it comes before any other deliverable at
 * `otherAt` (a film or a static piece; -1 for none). "עמוד נחיתה עם סרטון" is a landing page;
 * "סרטון לקידום עמוד נחיתה" and "מודעה לקידום עמוד נחיתה" are not: the same first-word rule
 * roles.ts uses for a film against a post. Every mention is read, so a page named first as context
 * ("for our landing page migration, build a landing page") still counts when it is asked for later.
 */
export function asksForLanding(
  text: string | null | undefined,
  otherAt = -1,
): boolean {
  const source = text ?? "";
  for (const match of source.matchAll(LANDING_WORDS)) {
    if (otherAt >= 0 && match.index >= otherAt) {
      return false;
    }
    const before = source.slice(0, match.index);
    const after = source.slice(match.index + match[0].length);
    if (!LEADS_TO_IT.test(before) && !DESCRIBES_OTHER.test(after)) {
      return true;
    }
  }
  return false;
}

/** True for the payload of a landing page project. */
export function isLandingProject(payload: Record<string, unknown>): boolean {
  return payload.project_type === LANDING_PROJECT_TYPE;
}

/**
 * Text shown to the user without tap-question syntax. The copy can quote a client's site, and a
 * "[[בחירה: …]]" inside it would render as buttons the server never asked: the only real question
 * is the one the tool appends after the text.
 */
export function plainShownText(text: string): string {
  // Every bracket that is followed by its twin is split, so a run of three leaves no pair.
  return text.replace(/\[(?=\[)/g, "[ ").replace(/\](?=\])/g, "] ");
}
