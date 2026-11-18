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
  /עמוד(?:י)?\s+ה?נחיתה|דף\s+ה?נחיתה|דפי\s+ה?נחיתה|בניית\s+אתרים|לנדינג|\blanding\s*page/i;

/** Where the request first names a landing page, or -1 when it does not. */
export function landingAt(text: string | null | undefined): number {
  return (text ?? "").search(LANDING_WORDS);
}

/**
 * The request asks for a landing page as its deliverable: it names one, and names it before any
 * film word at `filmAt` (-1 for none). "עמוד נחיתה עם סרטון" is a landing page; "סרטון לקידום
 * עמוד נחיתה" is a film, the same first-word rule roles.ts uses for a film against a post.
 */
export function asksForLanding(
  text: string | null | undefined,
  filmAt = -1,
): boolean {
  const at = landingAt(text);
  return at >= 0 && (filmAt < 0 || at < filmAt);
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
  return text.replace(/\[\[/g, "[ [").replace(/\]\]/g, "] ]");
}
