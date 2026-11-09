import type { ListMarketingWorkItemsArgs } from "./marketing-work-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import type { MarketingWorkItemListRow } from "../tool-contracts-marketing.ts";
import { readMarketingWorkItemPayload } from "../tool-storage-contracts.ts";

/** Preserves the existing list_marketing_work_items executor and side-effect order. */
export async function executeListMarketingWorkItems(
  args: ListMarketingWorkItemsArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  let q = supabase
    .from("marketing_work_items")
    .select(
      "id, title, status, target_channel, client_id, pipeline_id, current_stage_id, payload, updated_at, clients(name)",
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(args.limit || 30);
  if (args.client_id) {
    q = q.eq("client_id", args.client_id);
  }
  if (args.status) {
    q = q.eq("status", args.status as MarketingWorkItemListRow["status"]);
  }
  const { data, error } = await q.returns<Array<MarketingWorkItemListRow>>();
  if (error) {
    throw error;
  }
  let items: Array<MarketingWorkItemListRow> = data || [];
  if (args.department) {
    items = items.filter(
      (it) =>
        (readMarketingWorkItemPayload(it.payload).department || "") ===
        args.department,
    );
  }
  return {
    count: items.length,
    items: items.map((it) => {
      const payload = readMarketingWorkItemPayload(it.payload);
      return {
        id: it.id,
        title: it.title,
        status: it.status,
        department: payload.department || null,
        client_id: it.client_id,
        client_name: it.clients?.name || null,
        target_channel: it.target_channel,
        current_stage_id: it.current_stage_id,
        updated_at: it.updated_at,
        brief_preview:
          typeof payload.brief_text === "string"
            ? payload.brief_text.slice(0, 160)
            : null,
      };
    }),
  };
}
