/**
 * Who works on a workshop request. Static creative goes to the designer, film concepts and
 * generated films to the producer, and a film cut from the user's own materials to the video
 * editor. The server decides before Carmen acts and pins that role's skin, so the right
 * specialist answers. Every role gets every workshop tool (offered-tools.ts).
 */
import { isExplicitDevTaskApproval } from "../dev-task-approval.ts";
import {
  isExplicitApprovalPhrase,
  isExplicitRejectionPhrase,
} from "../wa-approval-flow.ts";

export type WorkshopRole = "designer" | "producer" | "editor";

/**
 * The open project: a film or not, whether it is cut from the user's materials, and whether the
 * user picked one of its scenes on the board (the workshop context names its scene_id).
 */
export type ProjectKind = { video: boolean; edit: boolean; scene?: boolean };

/** The ai_skills row with the role's instructions. */
export const ROLE_SKILL: Record<WorkshopRole, string> = {
  designer: "workshop_designer",
  producer: "workshop_producer",
  editor: "workshop_editor",
};

/** The public persona (skin-roles.ts) whose portrait and name the chat shows. */
export const ROLE_PERSONA: Record<WorkshopRole, string> = {
  designer: "creative_direct",
  producer: "video_director",
  editor: "video_editor",
};

// JS \b does not see Hebrew letters, so short Hebrew words use [א-ת] lookarounds: "סרט" also
// after a prefix ("הסרט"), "ערכי" as a verb (also "וערכי", not "הערכים" or "ערכי המותג"), and "סטורי" not
// inside "היסטוריה".
const EDITOR =
  /(מהחומרים|מהחומר|מהקבצים|מהסרטונים|מהתמונות שלי|מהקטעים|שהעליתי|שהעלתי|שצילמתי|לערוך|(?<![א-ת])ו?ערכי(?![א-ת])(?!\s+ה?(?:מותג|חברה|עסק|ליבה))|תערכי|עריכה|עריכת|חתכי|לחתוך|footage|\bedit\b)/i;
const VIDEO =
  /(סרטון|וידאו|וידיאו|רילס|(?<![א-ת])[הבלמושכ]{0,3}ריל(?![א-ת])|טיקטוק|פרומו|תסריט|סטוריבורד|הנפש|ליפ ?סינק|קריינ|\bvideo\b|\breel|\bfilm\b|\bpromo\b|lip ?sync)/i;
/** "סרט" alone (also "הסרט", "סרטים") is a film unless the message asks for a post or an ad about films. */
const FILM_NOUN = /(?<![א-ת])[הבלמושכ]{0,3}סרט(?:ים|י)?(?![א-ת])/;
/** A new static deliverable: moves to the designer even inside a film project. */
const STATIC_DELIVERABLE =
  /(פוסט|מודע|באנר|(?<!י)סטורי|פלייר|קרוסלה|\bpost\b|\bbanner\b|\bflyer\b|\bad\b)/i;
/** Picture words: the designer's only when the open project is not a film. */
const STATIC_HINT = /(תמונ|קריאייטיב|לוגו|גרפיק|עיצוב|\bstatic\b|\bimage\b)/i;

/** Carmen's persona names (skin-roles.ts) as the user says them: "המעצבת שלך". */
const PERSONA =
  "(?:מנהלת\\s+ה?שיווק|קופירייטרית|במאית|מפיקה|מעצבת|עורכת(?:\\s+ה?וידאו)?|בונת\\s+ה?אתרים|אוטומטורית|קמפיינרית|אנליסטית)";

/**
 * Questions about Carmen herself: her skins or personas and their images, what she can do, what
 * she has access to, who she is. "תמונ" in such a question is not a picture to design. A skin
 * word counts only as hers ("הסקינים", "הסקין שלך"), never skincare ("סקינקר", "סקין קר") or
 * skinny jeans ("סקיני").
 */
const ABOUT_HER_SKINS = new RegExp(
  [
    "(?<![א-ת])[בהולש]{0,2}סקינ(?:ים|ס)(?![א-ת])",
    `(?<![א-ת])ה?סקין\\s+(?:שלך|של\\s+(?:כרמן|ה?${PERSONA}))`,
    "(?<![א-ת])ה?(?:פרסונות|דמויות|תפקידים)\\s+שלך",
    "(?<![א-ת])[בלש]?הפרסונות(?![א-ת])(?!\\s+(?:של|ל|ש))",
    "\\bskins\\b",
    "\\byour\\s+(?:skins?|personas?)\\b",
  ].join("|"),
  "i",
);
/** Her own picture, or a persona's: "תמונה שלך", "איך נראית המעצבת שלך". */
const ABOUT_HER_LOOKS = new RegExp(
  [
    "תמונ(?:ה|ות)\\s+(?:של\\s+)?(?:עצמך|שלך)",
    `(?:תמונ|נראית|נראות|דיוקן)\\S*(?:\\s+\\S+){0,4}?\\s+ה?${PERSONA}\\s+שלך`,
    `ה?${PERSONA}\\s+שלך(?:\\s+\\S+){0,3}?\\s+(?:נראית|תמונ)`,
  ].join("|"),
  "i",
);
const ABOUT_HER_ABILITIES =
  /(יש\s+לך\s+(גישה|הרשאה|אפשרות\s+לגשת)|(?<![א-ת])את\s+(יכולה\s+לגשת|מסוגלת\s+לגשת|רואה\s+את\s+התמונות)|מה\s+את\s+(יודעת|יכולה|מסוגלת)\s+לעשות|(?<![א-ת])ה?יכולות\s+(שלך|יש\s+לך)|(?<![א-ת])ה?כלים\s+שלך|(?:אילו|איזה|באילו|באיזה)\s+(כלים|יכולות|סקילים|סקילס)|(?<![א-ת])[בהו]?סקיל(?:ים|ס)(?![א-ת])|(?<![א-ת])מי\s+את(?![א-ת])|איך\s+את\s+(נראית|עובדת)|\bwhat\s+can\s+you\s+do\b|\bdo\s+you\s+have\s+access\b|\byour\s+skills\b)/i;
/** Asking for a deliverable: then the message is work, whatever it says about her. */
const MAKE =
  /(?<![א-ת])(?:ו?ת(?:עשי|כיני|ייצרי|צרי|עצבי)|צרי|ליצור|לייצר|לעצב|להכין)(?![א-ת])|\b(?:make|create|design)\b/i;

/** The message asks about Carmen herself, not for work to be made. */
export function aboutCarmen(message: string | null | undefined): boolean {
  const text = String(message ?? "");
  if (
    VIDEO.test(text) ||
    FILM_NOUN.test(text) ||
    STATIC_DELIVERABLE.test(text) ||
    MAKE.test(text)
  )
    return false;
  return (
    ABOUT_HER_SKINS.test(text) ||
    ABOUT_HER_LOOKS.test(text) ||
    ABOUT_HER_ABILITIES.test(text)
  );
}

/** Quoted words: what a scene should say or show ("שתגיד 'אני מריצה לך מודעות'"), not a request. */
const QUOTED = /["“”״][^"“”״]*["“”״]|['‘’׳][^'‘’׳]*['‘’׳]/g;

/**
 * With a scene picked, only a request to make a new post or ad leaves the film: a verb of making
 * and a static deliverable outside quotes ("סצנה 3: תכיני גם פוסט עם התמונה הזאת").
 */
const asksForStatic = (text: string) => {
  const own = text.replace(QUOTED, " ");
  return MAKE.test(own) && STATIC_DELIVERABLE.test(own);
};

/** A bare yes or no ("כן", "כן, לשלוח", "לא"): an answer to Carmen, not a new request. */
function bareReply(text: string) {
  return (
    isExplicitApprovalPhrase(text) ||
    isExplicitRejectionPhrase(text) ||
    isExplicitDevTaskApproval(text)
  );
}

/** The role a persona slug (the chat's current skin) stands for, if any. */
export function roleOfPersona(slug: string | null | undefined) {
  const entry = Object.entries(ROLE_PERSONA).find(
    ([role, persona]) =>
      persona === slug || ROLE_SKILL[role as WorkshopRole] === slug,
  );
  return entry ? (entry[0] as WorkshopRole) : null;
}

/**
 * The role for this message. Editing words win (a film from materials), then film words, then a
 * new static deliverable. Otherwise the open project decides (a film stays with its producer or
 * editor, so "תשני את התמונה בסצנה 2" does not go to the designer), then the current role.
 * A scene picked on the board keeps the film's specialist, who changes it (workshop_update_scene):
 * a skin's line naturally says "פוסטים" or "מודעות". A question about Carmen herself keeps the
 * current role, or none (the workshop's own persona): it is answered, not briefed. So does a bare
 * yes or no on a board with no project or role yet.
 */
export function workshopRole(
  message: string,
  current: string | null | undefined,
  project: ProjectKind | null = null,
): WorkshopRole | null {
  const text = String(message ?? "");
  if (aboutCarmen(text)) return roleOfPersona(current);
  if (EDITOR.test(text)) return "editor";
  if (VIDEO.test(text)) return project?.edit ? "editor" : "producer";
  if (project?.video && project.scene && !asksForStatic(text))
    return project.edit ? "editor" : "producer";
  // "סרט לסטורי" is a film, "פוסט על הסרט" a post: the word that comes first is the deliverable.
  const film = text.search(FILM_NOUN);
  const still = text.search(STATIC_DELIVERABLE);
  if (film >= 0 && (still < 0 || film < still))
    return project?.edit ? "editor" : "producer";
  if (still >= 0) return "designer";
  if (project?.video) return project.edit ? "editor" : "producer";
  if (project && STATIC_HINT.test(text)) return "designer";
  if (STATIC_HINT.test(text) && !roleOfPersona(current)) return "designer";
  // With no project and no specialist yet, a bare yes or no answers the workshop's own persona
  // (say, a dev task she offered after a question about herself), not a designer's brief.
  if (!project && !roleOfPersona(current) && bareReply(text)) return null;
  return roleOfPersona(current) ?? "designer";
}
