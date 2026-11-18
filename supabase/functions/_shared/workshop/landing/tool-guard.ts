import type { Db } from "../db.ts";
import { isLandingProject } from "./kind.ts";

/**
 * The tools that start picture or film work on a project. The ones that continue a film (scenes,
 * stills, voice, production) need scenes a landing page never has, so they refuse on their own
 * and are spared the extra project read.
 */
const NOT_FOR_LANDING = new Set([
  "workshop_make_creative",
  "workshop_save_concepts",
  "workshop_save_script",
  "workshop_storyboard",
  "workshop_edit_from_assets",
]);

/**
 * The refusal for a picture or film tool called on a landing page project, or null when the call
 * may run. Without it a storyboard call would turn the landing page into a film.
 */
export async function landingToolRefusal(
  supabase: Db,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
  assertClientAccess: (clientId: string) => Promise<void>,
): Promise<{ error: string } | null> {
  const itemId = typeof args.item_id === "string" ? args.item_id.trim() : "";
  if (!NOT_FOR_LANDING.has(name) || !itemId) {
    return null;
  }
  const { data, error } = await supabase
    .from("marketing_work_items")
    .select("client_id, payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) {
    // Unknown is not "not a landing page": letting the call through could film a landing page.
    console.error(
      `landing tool guard: project ${itemId} not read: ${error.message}`,
    );
    return { error: "לא הצלחתי לקרוא את הפרויקט. נסי שוב." };
  }
  const payload = (data?.payload ?? {}) as Record<string, unknown>;
  if (!isLandingProject(payload)) {
    return null;
  }
  if (typeof data?.client_id === "string") {
    try {
      await assertClientAccess(data.client_id);
    } catch {
      // Denied or not checked, the call stops here, with the answer any project would get: the
      // project's kind is not this caller's to learn.
      return { error: "אין הרשאה ללקוח הזה" };
    }
  }
  return {
    error:
      "זה פרויקט עמוד נחיתה: בלי תמונות, סטוריבורד או סרטון. הכלים שלו: workshop_save_landing_copy ואז workshop_save_landing_style. לתמונה או לסרטון פותחים פרויקט נפרד.",
  };
}
