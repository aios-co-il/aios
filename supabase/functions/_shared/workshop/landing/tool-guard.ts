import type { Db } from "../db.ts";
import { isLandingProject } from "./kind.ts";

/** Picture and film tools: a landing page project has no use for them. */
const NOT_FOR_LANDING = new Set([
  "workshop_make_creative",
  "workshop_save_concepts",
  "workshop_save_script",
  "workshop_storyboard",
  "workshop_update_scene",
  "workshop_make_stills",
  "workshop_choose_voice",
  "workshop_edit_from_assets",
  "workshop_produce_video",
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
): Promise<{ error: string } | null> {
  const itemId = typeof args.item_id === "string" ? args.item_id.trim() : "";
  if (!NOT_FOR_LANDING.has(name) || !itemId) {
    return null;
  }
  const { data } = await supabase
    .from("marketing_work_items")
    .select("payload")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const payload = (data?.payload ?? {}) as Record<string, unknown>;
  if (!isLandingProject(payload)) {
    return null;
  }
  return {
    error:
      "זה פרויקט עמוד נחיתה: בלי תמונות, סטוריבורד או סרטון. הכלים שלו: workshop_save_landing_copy ואז workshop_save_landing_style. לתמונה או לסרטון פותחים פרויקט נפרד.",
  };
}
