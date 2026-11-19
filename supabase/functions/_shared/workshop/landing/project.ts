/**
 * A landing page project: the fourth kind of Workshop project. Its work is the page copy, then the
 * visual style, each approved by the user before the next; pictures and films are not part of it.
 * The state lives in the project's payload under "landing".
 */
import { approvalAnswer } from "../script-approval.ts";
import type { LandingBlock } from "./page-content.ts";
import { type LandingStyle, landingStyleText } from "./page-style.ts";
import { landingCopyText } from "./page-text.ts";

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
  /** The last build pushed to the page's branch; `digest` names the content it holds. */
  build?: LandingBuild;
  /** The digest of the build the user approved for publishing. */
  publish_approved?: string;
  /** The build that was sent to go live. */
  published?: { digest: string; pull_url: string; live_url: string };
}

export interface LandingBuild {
  branch: string;
  commit: string;
  digest: string;
  /** The page inside the Vercel preview, once it is built. */
  preview_url?: string;
  /** True when this build also creates the client's site, which a person merges. */
  new_site?: boolean;
}

export const COPY_LABEL = "הקופי";
export const APPROVE_COPY = "הקופי מאושר";
export const STYLE_LABEL = "הסגנון";
export const APPROVE_STYLE = "הסגנון מאושר";
const CHANGE = "לתקן";
/** The tap question that ends the copy Carmen shows. */
export const COPY_CHOICE = `[[בחירה: ${COPY_LABEL} | ${APPROVE_COPY} | ${CHANGE}]]`;
export const PUBLISH_LABEL = "פרסום";
export const APPROVE_PUBLISH = "לפרסם את העמוד";
/** The tap question that ends the preview Carmen shows. */
export const PUBLISH_CHOICE = `[[בחירה: ${PUBLISH_LABEL} | ${APPROVE_PUBLISH} | עוד לא]]`;
/**
 * The short name of a build, shown with its preview. An approval counts only when Carmen's
 * message carries the name of the build the project holds now, so a tap on an older message never
 * approves a build the user has not seen.
 */
export function buildTag(digest: string): string {
  return `גרסה ${digest.slice(0, 8)}`;
}
/** The tap question that ends the style Carmen shows. */
export const STYLE_CHOICE = `[[בחירה: ${STYLE_LABEL} | ${APPROVE_STYLE} | ${CHANGE}]]`;

/** The project's landing state; empty before the copy is written. */
export function landingStateOf(payload: Record<string, unknown>): LandingState {
  const raw = payload.landing;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as LandingState)
    : {};
}

/**
 * What a new copy or style does to the build: the build and its publish approval describe the
 * old content, so both go. The page must be built and approved again.
 */
export const BUILD_CLEARED: LandingState = {
  build: undefined,
  publish_approved: undefined,
};

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
  // Publishing is approved for one build: the preview the user was shown with the question.
  const publish = answer(PUBLISH_LABEL, APPROVE_PUBLISH);
  const built =
    state.build?.preview_url &&
    turn.lastAssistant.includes(buildTag(state.build.digest))
      ? state.build.digest
      : undefined;
  if (
    built &&
    state.publish_approved !== built &&
    publish.asked &&
    publish.approved
  ) {
    patch.publish_approved = built;
  }
  const changed = Object.keys(patch).length > 0;
  return { payload: changed ? withLanding(payload, patch) : payload, changed };
}

/**
 * What Carmen does with a request the page's sections cannot hold: the landing-pages app is code,
 * and a coding agent extends it. The new section or feature then becomes part of the page.
 */
const LANDING_BEYOND_SECTIONS =
  "בקשה שהמקטעים לא יודעים לעשות (פונקציה חדשה, אינטגרציה, מקטע או עיצוב מיוחד): משימת פיתוח ל-Claude (create_dev_task עם assigned_agent claude) בריפו aios-co-il/landing-pages, עם תיאור מה העמוד צריך. השינוי ממוזג שם על ידי אדם, ורק אחריו משתמשים בו בעמוד. אל תבטיחי את הפונקציה לפני שהיא קיימת.";

/**
 * Where the project stands and what Carmen does next; sent to her on every turn. A step that waits
 * for approval comes with its saved text: in a new conversation this is her only copy of it.
 */
export function landingTurnLines(
  payload: Record<string, unknown>,
): Array<string> {
  const state = landingStateOf(payload);
  const lines = [
    `זה פרויקט עמוד נחיתה. הסדר: בריף ורפרנסים, קופי העמוד (workshop_save_landing_copy), אישור הקופי, סגנון עיצובי (workshop_save_landing_style), אישור הסגנון, ואז בנייה. בפרויקט הזה לא יוצרים תמונות, סטוריבורד או סרטון. ${LANDING_BEYOND_SECTIONS}`,
  ];
  if (!state.blocks) {
    lines.push(
      "השלב הבא: קופי העמוד. עמוד שכבר באוויר (עריכה של עמוד קיים): קודם workshop_import_landing_page, ואז משנים. עמוד חדש: חסר מידע שאי אפשר להסיק (מה מציעים, למי, מה הגולש משאיר)? שאלי שאלה אחת. אחרת כתבי את העמוד ושמרי ב-workshop_save_landing_copy.",
    );
  } else if (!state.copy_approved) {
    lines.push(
      `הקופי נשמר ועוד לא אושר. המשתמש ביקש שינוי: כתבי את העמוד מחדש ושמרי שוב ב-workshop_save_landing_copy. אחרת: הציגי את הקופי, סיימי בשורה ${COPY_CHOICE} ועצרי.`,
      `הקופי השמור:\n${landingCopyText(state.blocks)}`,
    );
  } else if (!state.style) {
    lines.push(
      "הקופי אושר. השלב הבא: סגנון עיצובי לפי המותג של הלקוח והרפרנסים שבפרויקט (workshop_save_landing_style).",
    );
  } else if (!state.style_approved) {
    lines.push(
      `הסגנון נשמר ועוד לא אושר. המשתמש ביקש שינוי: שמרי סגנון מתוקן ב-workshop_save_landing_style. אחרת: הציגי את הסגנון, סיימי בשורה ${STYLE_CHOICE} ועצרי.`,
      `הסגנון השמור:\n${landingStyleText(state.style)}`,
    );
  } else {
    lines.push(buildStepLine(state));
  }
  return lines;
}

/** The next step once the copy and the style are approved: build, preview, publish. */
function buildStepLine(state: LandingState): string {
  const build = state.build;
  if (!build) {
    return "הקופי והסגנון אושרו. השלב הבא: בניית העמוד (workshop_build_landing_page). הכתובת ויעד הלידים נקבעים בהגדרות שבראש הפרויקט; אם הכלי מחזיר שחסרה כתובת, בקשי מהמשתמש להגדיר אותה שם.";
  }
  if (!build.preview_url) {
    return "העמוד נבנה והתצוגה המקדימה עוד עולה. קראי שוב ל-workshop_build_landing_page כדי לקבל את הקישור.";
  }
  if (state.published?.digest === build.digest) {
    return `העמוד נשלח לפרסום: ${state.published.live_url}. שינוי בעמוד: שמרי קופי או סגנון חדש, קבלי אישור ובני מחדש.`;
  }
  if (state.publish_approved === build.digest) {
    return "המשתמש אישר לפרסם את העמוד. פרסמי אותו: workshop_publish_landing_page.";
  }
  return `העמוד נבנה ומחכה לאישור פרסום. תצוגה מקדימה: ${build.preview_url}. המשתמש ביקש שינוי: שמרי קופי או סגנון מתוקן, קבלי אישור ובני מחדש. אחרת: שלחי לו את הקישור עם שם הבנייה "${buildTag(build.digest)}" כמו שהוא, סיימי בשורה ${PUBLISH_CHOICE} ועצרי. מפרסמים רק אחרי האישור שלו.`;
}
