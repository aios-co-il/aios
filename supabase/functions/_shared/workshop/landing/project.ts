/**
 * A landing page project: the fourth kind of Workshop project. Its work is the page copy, then the
 * visual style, each approved by the user before the next; pictures and films are not part of it.
 * The state lives in the project's payload under "landing".
 */
import { approvalAnswer } from "../script-approval.ts";
import type { LandingBlock } from "./page-content.ts";
import type { LandingStyle } from "./page-style.ts";

export {
  LANDING_DEPARTMENT,
  LANDING_PROJECT_TYPE,
  asksForLanding,
  isLandingProject,
} from "./kind.ts";

/** What a landing page project holds so far. */
export interface LandingState {
  blocks?: Array<LandingBlock>;
  copy_approved?: boolean;
  style?: LandingStyle;
  style_approved?: boolean;
}

export const COPY_LABEL = "הקופי";
export const APPROVE_COPY = "הקופי מאושר";
export const STYLE_LABEL = "הסגנון";
export const APPROVE_STYLE = "הסגנון מאושר";
const CHANGE = "לתקן";
/** The tap question that ends the copy Carmen shows. */
export const COPY_CHOICE = `[[בחירה: ${COPY_LABEL} | ${APPROVE_COPY} | ${CHANGE}]]`;
/** The tap question that ends the style Carmen shows. */
export const STYLE_CHOICE = `[[בחירה: ${STYLE_LABEL} | ${APPROVE_STYLE} | ${CHANGE}]]`;

/** The project's landing state; empty before the copy is written. */
export function landingStateOf(payload: Record<string, unknown>): LandingState {
  const raw = payload.landing;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as LandingState)
    : {};
}

/** The payload with part of its landing state replaced. */
export function withLanding(
  payload: Record<string, unknown>,
  patch: LandingState,
): Record<string, unknown> {
  return { ...payload, landing: { ...landingStateOf(payload), ...patch } };
}

/**
 * The payload with the copy or the style approved when the user's message is a clean approval of
 * the question Carmen's last message asked. A step is approved only once it exists.
 */
export function withLandingApprovals(
  payload: Record<string, unknown>,
  turn: { lastAssistant: string; userText: string },
): { payload: Record<string, unknown>; changed: boolean } {
  const state = landingStateOf(payload);
  /** How the user answered one of the two approval questions. */
  function answer(label: string, option: string) {
    return approvalAnswer(turn.lastAssistant, turn.userText, label, option);
  }
  const copy = answer(COPY_LABEL, APPROVE_COPY);
  const style = answer(STYLE_LABEL, APPROVE_STYLE);
  const patch: LandingState = {};
  if (state.blocks && !state.copy_approved && copy.asked && copy.approved) {
    patch.copy_approved = true;
  }
  if (state.style && !state.style_approved && style.asked && style.approved) {
    patch.style_approved = true;
  }
  const changed = Object.keys(patch).length > 0;
  return { payload: changed ? withLanding(payload, patch) : payload, changed };
}

/** Where the project stands and what Carmen does next; sent to her on every turn. */
export function landingTurnLines(
  payload: Record<string, unknown>,
): Array<string> {
  const state = landingStateOf(payload);
  const lines = [
    "זה פרויקט עמוד נחיתה. הסדר: בריף ורפרנסים, קופי העמוד (workshop_save_landing_copy), אישור הקופי, סגנון עיצובי (workshop_save_landing_style), אישור הסגנון, ואז בנייה. בפרויקט הזה לא יוצרים תמונות, סטוריבורד או סרטון.",
  ];
  if (!state.blocks) {
    lines.push(
      "השלב הבא: קופי העמוד. חסר מידע שאי אפשר להסיק (מה מציעים, למי, מה הגולש משאיר)? שאלי שאלה אחת. אחרת כתבי את העמוד ושמרי ב-workshop_save_landing_copy.",
    );
  } else if (!state.copy_approved) {
    lines.push(
      `הקופי נשמר ועוד לא אושר. המשתמש ביקש שינוי: כתבי את העמוד מחדש ושמרי שוב ב-workshop_save_landing_copy. אחרת: הציגי את הקופי, סיימי בשורה ${COPY_CHOICE} ועצרי.`,
    );
  } else if (!state.style) {
    lines.push(
      "הקופי אושר. השלב הבא: סגנון עיצובי לפי המותג של הלקוח והרפרנסים שבפרויקט (workshop_save_landing_style).",
    );
  } else if (!state.style_approved) {
    lines.push(
      `הסגנון נשמר ועוד לא אושר. המשתמש ביקש שינוי: שמרי סגנון מתוקן ב-workshop_save_landing_style. אחרת: הציגי את הסגנון, סיימי בשורה ${STYLE_CHOICE} ועצרי.`,
    );
  } else {
    lines.push(
      "הקופי והסגנון אושרו. בניית העמוד ופרסומו עוד לא זמינים מכאן: אמרי למשתמש שהעמוד מוכן לבנייה ושההגדרות (כתובת ויעד הלידים) נמצאות בראש הפרויקט.",
    );
  }
  return lines;
}
