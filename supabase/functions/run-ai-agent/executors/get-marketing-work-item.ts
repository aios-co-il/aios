import type { MarketingWorkItemListRow } from "../tool-contracts-marketing.ts";
import type { GetMarketingWorkItemArgs } from "./marketing-work-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { MarketingStageSummary } from "../tool-contracts-marketing.ts";

/** Preserves the existing get_marketing_work_item executor and side-effect order. */
export async function executeGetMarketingWorkItem(
  args: GetMarketingWorkItemArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  const { data: item, error } = await supabase
    .from("marketing_work_items")
    .select(
      "id, title, status, target_channel, client_id, pipeline_id, current_stage_id, payload, links, scheduled_date, created_at, updated_at, clients(name)",
    )
    .eq("id", args.item_id)
    .eq("tenant_id", tenantId)
    .maybeSingle()
    .returns<
      MarketingWorkItemListRow & {
        links: unknown;
        scheduled_date: string | null;
        created_at: string;
      }
    >();
  if (error || !item) {
    return { error: "עבודה לא נמצאה" };
  }
  let stage = null;
  if (item.current_stage_id) {
    const { data: st } = await supabase
      .from("marketing_pipeline_stages")
      .select("id, name, stage_type, sort_order")
      .eq("id", item.current_stage_id)
      .maybeSingle();
    stage = st;
  }
  let stages: Array<MarketingStageSummary> = [];
  if (item.pipeline_id) {
    const { data: sts } = await supabase
      .from("marketing_pipeline_stages")
      .select("id, name, stage_type, sort_order")
      .eq("pipeline_id", item.pipeline_id)
      .order("sort_order");
    stages = sts || [];
  }
  return {
    item: { ...item, client_name: item.clients?.name },
    current_stage: stage,
    pipeline_stages: stages,
  };
}
