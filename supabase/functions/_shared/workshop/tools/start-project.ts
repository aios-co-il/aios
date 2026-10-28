import { syncClientAssets } from "../assets.ts";
import { withBriefAnswers } from "../brief-answers.ts";
import { type StartProjectPlan, planProject } from "../defaults.ts";
import { publicUrlOf } from "../project-io.ts";
import { creativeStageFor, recordArtifact } from "../record.ts";
import { briefPayload } from "../scene-helpers.ts";
import { tappedAnswers } from "../tapped-answers.ts";
import { type ToolContext } from "../tool-context.ts";
import { VIEW_CLIENT_DENIED, startProjectClient } from "../view-client.ts";

export async function workshopStartProject(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, userId, deps } = ctx;
  const brief = String(args.brief ?? "").trim();
  if (!brief) return { error: "brief נדרש" };
  const start = startProjectClient(args.client_id, deps.viewClientId);
  let clientId = start.clientId;
  let clientNote: string | undefined;
  if (clientId) {
    try {
      await assertClientAccess(clientId);
    } catch (error) {
      if (!start.fromView)
        return {
          error: error instanceof Error ? error.message : "אין הרשאה ללקוח הזה",
        };
      clientId = null;
      clientNote = VIEW_CLIENT_DENIED;
    }
  }
  const plan = planProject({
    brief,
    title: typeof args.title === "string" ? args.title : undefined,
    kind: ["video", "static", "campaign"].includes(String(args.kind))
      ? (args.kind as StartProjectPlan["kind"])
      : undefined,
    formats: Array.isArray(args.formats)
      ? (args.formats as unknown[]).map(String)
      : undefined,
    duration_s:
      typeof args.duration_s === "number" ? args.duration_s : undefined,
    visual_style:
      typeof args.visual_style === "string" ? args.visual_style : undefined,
  });
  let pipelineId: string | null = null;
  let stageId: string | null = null;
  if (clientId) {
    try {
      ({ pipelineId, stageId } = await creativeStageFor(
        supabase,
        tenantId,
        clientId,
      ));
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "פתיחת הפייפליין נכשלה",
      };
    }
  }
  const created = await supabase
    .from("marketing_work_items")
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      pipeline_id: pipelineId,
      current_stage_id: stageId,
      title: plan.title,
      status: "draft",
      target_channel: plan.projectType === "video" ? "video" : "creative",
      // Taps on questions Carmen asked before the project existed start its brief, so the
      // briefing does not ask them again.
      payload: withBriefAnswers(
        briefPayload(plan, brief),
        tappedAnswers(deps.lastAssistant ?? "", deps.userText ?? ""),
      ),
      created_by: userId,
    })
    .select("id")
    .single();
  if (created.error) return { error: created.error.message };
  const itemId = created.data.id as string;
  const artifact = await recordArtifact(supabase, {
    tenantId,
    itemId,
    kind: "brief",
    title: plan.title,
    meta: { summary: plan.summary, brief, plan },
  });
  let clientAssets = 0;
  if (clientId) {
    const synced = await syncClientAssets(
      supabase,
      { tenantId, itemId, clientId },
      publicUrlOf(supabase),
    );
    clientAssets = synced.added;
  }
  return {
    success: true,
    item_id: itemId,
    title: plan.title,
    client_assets: clientAssets,
    decided: {
      kind: plan.kind,
      format: plan.format,
      formats: plan.formats,
      visual_style: plan.visualStyle,
      film: plan.film,
    },
    summary: plan.summary,
    client_known: !!clientId,
    ...(start.fromView && clientId ? { client_from_view: true } : {}),
    ...(clientNote ? { client_note: clientNote } : {}),
    artifact,
    workshop: { event: "project", item_id: itemId, artifact_id: artifact.id },
  };
}
