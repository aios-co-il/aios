import { isLandingProject } from "../landing/kind.ts";
import { loadProject } from "../project-io.ts";
import { type ToolContext } from "../tool-context.ts";

/** Loads the tool's project inside the caller's org and refuses one that is not a landing page. */
export async function loadLandingProject(ctx: ToolContext) {
  const itemId = String(ctx.args.item_id ?? "").trim();
  if (!itemId) {
    return { error: "item_id נדרש" };
  }
  const loaded = await loadProject(
    ctx.supabase,
    ctx.tenantId,
    itemId,
    ctx.assertClientAccess,
  );
  if ("error" in loaded) {
    return loaded;
  }
  if (!isLandingProject(loaded.project.payload)) {
    return {
      error:
        "הפרויקט הזה אינו עמוד נחיתה. לעמוד נחיתה פותחים פרויקט חדש: workshop_start_project עם kind=landing",
    };
  }
  return loaded;
}
