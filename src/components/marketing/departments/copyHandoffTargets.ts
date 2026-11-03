import { supabase } from "@/integrations/supabase/client";
import { listOpenCreativeProjects, type HandoffWorkItem } from "../copyHandoff";
import { readCreativeHandoffItems } from "../copyPayload";

/** Load a client's eligible handoff targets with the tenant's routing context. */
export async function loadCopyHandoffTargets(
  tenantId: string,
  copyItem: HandoffWorkItem,
) {
  if (!copyItem.client_id) throw new Error("Copy handoff requires a client");
  const [
    { data: siblings, error: siblingError },
    { data: creativeStages, error: stageError },
    { data: socialPipelines, error: pipelineError },
  ] = await Promise.all([
    supabase
      .from("marketing_work_items")
      .select(
        "id,title,status,payload,current_stage_id,pipeline_id,client_id,created_at,updated_at",
      )
      .eq("tenant_id", tenantId)
      .eq("client_id", copyItem.client_id)
      .neq("id", copyItem.id)
      .neq("status", "archived"),
    supabase
      .from("marketing_pipeline_stages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("stage_type", "creative"),
    supabase
      .from("marketing_pipelines")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("track", "social_organic"),
  ]);
  if (siblingError) throw siblingError;
  if (stageError) throw stageError;
  if (pipelineError) throw pipelineError;
  const creativeStageIds = new Set(
    (creativeStages ?? []).map((stage) => stage.id),
  );
  return listOpenCreativeProjects(
    copyItem,
    readCreativeHandoffItems(
      siblings ?? [],
      creativeStageIds,
      new Set((socialPipelines ?? []).map((pipeline) => pipeline.id)),
    ),
    creativeStageIds,
  );
}
