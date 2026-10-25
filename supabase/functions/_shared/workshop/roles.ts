/**
 * Who works on a workshop request. Static creative goes to the designer, film concepts and
 * generated films to the producer, and a film cut from the user's own materials to the video
 * editor. The server decides before Carmen acts, pins that role's skin and offers only that
 * role's workshop tools, so the right specialist answers with the tools her task needs.
 */

export type WorkshopRole = "designer" | "producer" | "editor";

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
    "workshop_produce_video",
  ],
  editor: [
    ...SHARED,
    "workshop_edit_from_assets",
    "workshop_storyboard",
    "workshop_make_stills",
    "workshop_produce_video",
  ],
};

const EDITOR =
  /(מהחומרים|מהחומר|מהקבצים|מהסרטונים|מהתמונות שלי|מהקטעים|שהעליתי|שהעלתי|שצילמתי|לערוך|ערכי|תערכי|עריכה|עריכת|חתכי|לחתוך|footage|\bedit\b|\bcut\b)/i;
const VIDEO =
  /(סרטון|וידאו|וידיאו|סרט\b|סרט |רילס|ריל\b|טיקטוק|פרומו|תסריט|סטוריבורד|הנפש|ליפ ?סינק|קריינ|\bvideo\b|\breel|\bfilm\b|\bpromo\b|lip ?sync)/i;
const STATIC =
  /(פוסט|מודע|באנר|תמונ|סטורי|קריאייטיב|פלייר|קרוסלה|לוגו|גרפיק|עיצוב|\bpost\b|\bbanner\b|\bad\b|\bflyer\b|\bstatic\b)/i;

/** The role a persona slug (the chat's current skin) stands for, if any. */
export function roleOfPersona(slug: string | null | undefined) {
  const entry = Object.entries(ROLE_PERSONA).find(
    ([role, persona]) =>
      persona === slug || ROLE_SKILL[role as WorkshopRole] === slug,
  );
  return entry ? (entry[0] as WorkshopRole) : null;
}

/**
 * The role for this message. Editing words win (a film from materials), then film words, then
 * static words. A message with none of them ("כן", "תמשיכי") stays with the current role.
 */
export function workshopRole(
  message: string,
  current: string | null | undefined,
): WorkshopRole {
  const text = String(message ?? "");
  if (
    EDITOR.test(text) &&
    (VIDEO.test(text) || /לערוך|עריכ|ערכי|תערכי|edit|cut|footage/i.test(text))
  )
    return "editor";
  if (VIDEO.test(text)) return "producer";
  if (STATIC.test(text)) return "designer";
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
