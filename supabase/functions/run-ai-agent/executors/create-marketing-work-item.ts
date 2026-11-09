import type { CreateMarketingWorkItemArgs } from "./marketing-work-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { findOrCreateClientPipeline } from "../../_shared/marketing-client-pipeline.ts";
import type { MarketingStageSummary } from "../tool-contracts-marketing.ts";

/** Preserves the existing create_marketing_work_item executor and side-effect order. */
export async function executeCreateMarketingWorkItem(
  args: CreateMarketingWorkItemArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, userId, callerScope } = context;

  const client_id = args.client_id;
  const title = String(args.title || "").trim();
  const brief = String(args.brief || "").trim();
  if (!client_id || !title || !brief) {
    return { error: "client_id, title ו-brief נדרשים" };
  }
  await assertCallerCanAccessClient(supabase, client_id, callerScope);
  const department = ["copy", "creative", "seo"].includes(
    args.department as string,
  )
    ? args.department
    : "copy";
  const track = department === "seo" ? "seo_geo" : "campaigns";
  const stageType =
    department === "copy"
      ? "copy"
      : department === "creative"
        ? "creative"
        : "target_seo";

  // Ensure pipeline + default stages (mirrors ensurePipelineForClient). A client can have
  // duplicate pipelines: take the oldest, as the department screens do. A failed lookup
  // creates nothing.
  const found = await findOrCreateClientPipeline(supabase, {
    clientId: client_id,
    tenantId,
    track,
  });
  if ("error" in found) {
    return { error: found.error };
  }
  const pipeline = found;
  const { count: stageCount } = await supabase
    .from("marketing_pipeline_stages")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_id", pipeline.id);
  if ((stageCount ?? 0) === 0) {
    const defaultStages = [
      {
        stage_type: "strategy" as const,
        name: "בריף",
        sort_order: 0,
        position_x: 1120,
        position_y: 200,
      },
      {
        stage_type: "copy" as const,
        name: "כתיבת תוכן",
        sort_order: 1,
        position_x: 840,
        position_y: 200,
      },
      {
        stage_type: "creative" as const,
        name: "קריאייטיב",
        sort_order: 2,
        position_x: 560,
        position_y: 200,
      },
      {
        stage_type:
          track === "seo_geo"
            ? ("target_seo" as const)
            : ("target_paid" as const),
        name: track === "seo_geo" ? "SEO / GEO" : "קמפיין ממומן",
        sort_order: 3,
        position_x: 280,
        position_y: 200,
      },
      {
        stage_type: "measurement" as const,
        name: "מדידה",
        sort_order: 4,
        position_x: 0,
        position_y: 200,
      },
    ];
    await supabase.from("marketing_pipeline_stages").insert(
      defaultStages.map((s) => ({
        ...s,
        pipeline_id: pipeline.id,
        tenant_id: tenantId,
        approval_mode: "manual" as const,
        configuration: {},
      })),
    );
  }
  const { data: stages } = await supabase
    .from("marketing_pipeline_stages")
    .select("id, stage_type")
    .eq("pipeline_id", pipeline.id);
  const stageId =
    stages?.find(
      (s: Pick<MarketingStageSummary, "id" | "stage_type">) =>
        s.stage_type === stageType,
    )?.id || null;
  if (!stageId) {
    return { error: `שלב ${stageType} לא נמצא בפייפליין` };
  }

  const channel = args.channel || "כללי";
  const { data: item, error } = await supabase
    .from("marketing_work_items")
    .insert({
      tenant_id: tenantId,
      client_id,
      pipeline_id: pipeline.id,
      current_stage_id: stageId,
      title,
      status: "draft",
      target_channel: String(channel).toLowerCase().replace(/\s+/g, "_"),
      payload: {
        brief_text: brief,
        notes: args.instructions || "",
        instructions: args.instructions || "",
        content_type:
          args.content_type || (department === "copy" ? "ad_copy" : department),
        channel,
        department,
        intake_source: "carmen",
      },
      created_by: userId !== "system" ? userId : null,
    })
    .select("id, title, status, current_stage_id")
    .single();
  if (error) {
    throw error;
  }
  return {
    success: true,
    item_id: item.id,
    title: item.title,
    department,
    stage_type: stageType,
    status: item.status,
  };
}
