/**
 * Who works on a workshop request. Static creative goes to the designer, film concepts and
 * generated films to the producer, and a film cut from the user's own materials to the video
 * editor. The server decides before Carmen acts, pins that role's skin and offers only that
 * role's workshop tools, so the right specialist answers with the tools her task needs.
 */

export type WorkshopRole = "designer" | "producer" | "editor";

/** The open project: a film or not, and whether it is cut from the user's materials. */
export type ProjectKind = { video: boolean; edit: boolean };

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

const SHARED = [
  "workshop_start_project",
  "workshop_get_state",
  "workshop_check_connections",
  "workshop_inspect_site",
  "workshop_add_assets",
  "workshop_assign_client",
  "workshop_save_copy",
];

/** The workshop tools each role may call; other workshop tools are not offered. */
export const ROLE_TOOLS: Record<WorkshopRole, string[]> = {
  designer: [...SHARED, "workshop_save_concepts", "workshop_make_creative"],
  producer: [
    ...SHARED,
    "workshop_save_concepts",
    "workshop_storyboard",
    "workshop_make_stills",
    "workshop_choose_voice",
    "workshop_produce_video",
  ],
  editor: [
    ...SHARED,
    "workshop_edit_from_assets",
    "workshop_storyboard",
    "workshop_make_stills",
    "workshop_choose_voice",
    "workshop_produce_video",
  ],
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

/**
 * Questions about Carmen herself: her skins or personas and their images, what she can do, what
 * she has access to, who she is. "תמונ" in such a question is not a picture to design.
 */
const ABOUT_HER_SKINS =
  /(סקינ|סקין|(?<![א-ת])ה?פרסונות\s+שלך|(?<![א-ת])ה?דמויות\s+שלך|(?<![א-ת])ה?תפקידים\s+שלך|\bskins?\b|\byour\s+personas?\b)/i;
const ABOUT_HER_ABILITIES =
  /(יש\s+לך\s+(גישה|הרשאה|אפשרות\s+לגשת)|(?<![א-ת])את\s+(יכולה\s+לגשת|מסוגלת\s+לגשת|רואה\s+את\s+התמונות)|מה\s+את\s+(יודעת|יכולה|מסוגלת)\s+לעשות|(?<![א-ת])ה?יכולות\s+שלך|(?<![א-ת])ה?כלים\s+שלך|(?:אילו|איזה)\s+כלים\s+(יש\s+לך|את)|(?<![א-ת])מי\s+את(?![א-ת])|איך\s+את\s+(נראית|עובדת)|\bwhat\s+can\s+you\s+do\b|\bdo\s+you\s+have\s+access\b)/i;

/** The message asks about Carmen herself, not for work to be made. */
export function aboutCarmen(message: string | null | undefined): boolean {
  const text = String(message ?? "");
  return ABOUT_HER_SKINS.test(text) || ABOUT_HER_ABILITIES.test(text);
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
 * A question about Carmen herself keeps the current role, or none (the workshop's own persona):
 * it is answered, not briefed.
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
  // "סרט לסטורי" is a film, "פוסט על הסרט" a post: the word that comes first is the deliverable.
  const film = text.search(FILM_NOUN);
  const still = text.search(STATIC_DELIVERABLE);
  if (film >= 0 && (still < 0 || film < still))
    return project?.edit ? "editor" : "producer";
  if (still >= 0) return "designer";
  if (project?.video) return project.edit ? "editor" : "producer";
  if (project && STATIC_HINT.test(text)) return "designer";
  if (STATIC_HINT.test(text) && !roleOfPersona(current)) return "designer";
  return roleOfPersona(current) ?? "designer";
}

/** Keeps non-workshop tools; of the workshop tools keeps only the role's. */
export function toolsForRole<T extends { name: string }>(
  tools: T[],
  role: WorkshopRole,
  isWorkshopTool: (name: string) => boolean,
): T[] {
  const allowed = new Set(ROLE_TOOLS[role]);
  return tools.filter(
    (tool) => !isWorkshopTool(tool.name) || allowed.has(tool.name),
  );
}
