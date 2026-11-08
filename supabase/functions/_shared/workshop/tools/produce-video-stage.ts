/**
 * workshop_produce_video's bookkeeping around a production: the creative stage and client it runs
 * under, and the reply while another production of the project is running.
 */

import { creativeStageFor } from "../record.ts";
import { ENGINE_LABEL, isSceneEngine } from "../scene-engine.ts";
import { PAGE_COLUMNS } from "../scene-helpers.ts";
import type { ToolContext } from "../tool-context.ts";

/** The project fields the stage link reads. */
interface StagedProject {
  stage_id: string | null;
  client_id: string | null;
}

/**
 * The stage and client the production runs under. A project without a stage is linked to the
 * client's creative stage first (the client asked for, else its own; access checked for a new one).
 */
export async function linkStage(
  ctx: ToolContext,
  itemId: string,
  project: StagedProject,
): Promise<
  { stageId: string | null; clientId: string | null } | { error: string }
> {
  const { supabase, tenantId, args, assertClientAccess } = ctx;
  let stageId = project.stage_id;
  let clientId = project.client_id;
  if (!stageId) {
    const wanted = String(args.client_id ?? "").trim() || clientId || null;
    try {
      if (wanted && wanted !== project.client_id) {
        await assertClientAccess(wanted);
      }
      const stage = await creativeStageFor(supabase, tenantId, wanted);
      const linked = await supabase
        .from("marketing_work_items")
        .update({
          ...(wanted ? { client_id: wanted } : {}),
          pipeline_id: stage.pipelineId,
          current_stage_id: stage.stageId,
        })
        .eq("id", itemId)
        .eq("tenant_id", tenantId);
      if (linked.error) {
        return { error: linked.error.message };
      }
      stageId = stage.stageId;
      clientId = wanted;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "שיוך הלקוח נכשל",
      };
    }
  }
  return { stageId, clientId };
}

/** The project's pending film page, if a production left one. */
export const pendingFilm = (ctx: ToolContext, itemId: string) =>
  ctx.supabase
    .from("workshop_artifacts")
    .select(PAGE_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .eq("item_id", itemId)
    .eq("kind", "film")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

/** The reply while a production runs: nothing queued, no second charge. */
export const runningReply = (
  provider: unknown,
  client: unknown,
  artifact: unknown,
) => ({
  success: true,
  status: "running",
  already_running: true,
  engine: isSceneEngine(provider) ? ENGINE_LABEL[provider] : undefined,
  client_id: client,
  user_message: "הסרט כבר בהפקה, והוא יופיע בלוח כשיהיה מוכן.",
  message:
    "הפקה כבר רצה לפרויקט הזה ולא הותחלה שנייה. לבדוק את המצב: workshop_get_state (production), ולא להפיק שוב.",
  ...(artifact ? { artifact } : {}),
});
