import type { Database } from "../../_shared/database.types.ts";

import type { ToolExecutionContext } from "../tool-context.ts";
import type { MarketingStageSummary } from "../tool-contracts-marketing.ts";
import { readMarketingWorkItemPayload } from "../tool-storage-contracts.ts";

type HandoffMarketingWorkItemArgs = {
  item_id: string;
  to_stage_type:
    | "strategy"
    | "copy"
    | "creative"
    | "target_paid"
    | "target_seo"
    | "target_organic"
    | "measurement";
};

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
    .eq("pipeline_id", item.pipeline_id as string)
    .eq("tenant_id", tenantId);
  const stageRows: Array<Omit<MarketingStageSummary, "sort_order">> =
    stages || [];
  const target = stageRows.find((s) => s.stage_type === args.to_stage_type);
  if (!target) {
    return {
      error: `שלב ${args.to_stage_type} לא נמצא בפייפליין`,
      available: stageRows.map((s) => s.stage_type),
    };
  }
  // Compare the payload in the same UPDATE so a completed concurrent edit cannot be lost.
  const update = supabase
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
    .eq("tenant_id", tenantId);
  const currentPayload =
    item.payload === null
      ? update.is("payload", null)
      : update.eq("payload", JSON.stringify(item.payload));
  const { data: updated, error } = await currentPayload
    .select("id, title, current_stage_id, status")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!updated) {
    throw new Error("העבודה השתנתה בזמן ההעברה; יש לנסות שוב");
  }
  return {
    success: true,
    item_id: updated.id,
    title: updated.title,
    handed_off_to: target.name,
    stage_type: target.stage_type,
  };
}
