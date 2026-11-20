import type { Database } from "../../_shared/database.types.ts";
import type { HandoffMarketingWorkItemArgs } from "./marketing-work-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { MarketingStageSummary } from "../tool-contracts-marketing.ts";
import { readMarketingWorkItemPayload } from "../tool-storage-contracts.ts";

/** Preserves the existing handoff_marketing_work_item executor and side-effect order. */
export async function executeHandoffMarketingWorkItem(
  args: HandoffMarketingWorkItemArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data: item } = await supabase
    .from("marketing_work_items")
    .select("id, pipeline_id, payload, title")
    .eq("id", args.item_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!item) {
    return { error: "עבודה לא נמצאה" };
  }
  const { data: stages } = await supabase
    .from("marketing_pipeline_stages")
    .select("id, name, stage_type")
    .eq("pipeline_id", item.pipeline_id as string);
  const stageRows: Array<Omit<MarketingStageSummary, "sort_order">> =
    stages || [];
  const target = stageRows.find((s) => s.stage_type === args.to_stage_type);
  if (!target) {
    return {
      error: `שלב ${args.to_stage_type} לא נמצא בפייפליין`,
      available: stageRows.map((s) => s.stage_type),
    };
  }
  const { data: updated, error } = await supabase
    .from("marketing_work_items")
    .update({
      current_stage_id: target.id,
      status: "draft",
      payload: {
        ...((item.payload || {}) as Record<
          string,
          Database["public"]["Tables"]["marketing_work_items"]["Row"]["payload"]
        >),
        department:
          args.to_stage_type === "creative"
            ? "creative"
            : args.to_stage_type === "copy"
              ? "copy"
              : readMarketingWorkItemPayload(item.payload).department,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.item_id)
    .select("id, title, current_stage_id, status")
    .single();
  if (error) {
    throw error;
  }
  return {
    success: true,
    item_id: updated.id,
    title: updated.title,
    handed_off_to: target.name,
    stage_type: target.stage_type,
  };
}
