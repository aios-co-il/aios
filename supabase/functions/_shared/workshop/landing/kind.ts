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

/** The request asks for a landing page ("עמוד נחיתה", "פרויקט בניית אתרים חדש"). */
export function asksForLanding(text: string | null | undefined): boolean {
  return LANDING_WORDS.test(text ?? "");
}

/** True for the payload of a landing page project. */
export function isLandingProject(payload: Record<string, unknown>): boolean {
  return payload.project_type === LANDING_PROJECT_TYPE;
}
