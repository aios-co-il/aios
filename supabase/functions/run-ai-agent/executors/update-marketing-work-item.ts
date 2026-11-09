import type { Database } from "../../_shared/database.types.ts";
import type { UpdateMarketingWorkItemArgs } from "./marketing-work-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { stripServerOnlyPayloadKeys } from "../../_shared/workshop/blocked-tools.ts";

/** Preserves the existing update_marketing_work_item executor and side-effect order. */
export async function executeUpdateMarketingWorkItem(
  args: UpdateMarketingWorkItemArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId } = context;

  // The workshop's budget and project state are written only by its own server code.
  let droppedKeys: Array<string> = [];
  let payloadPatch: Record<string, unknown> | null = null;
  if (args.payload_patch && typeof args.payload_patch === "object") {
    const safe = stripServerOnlyPayloadKeys(
      args.payload_patch as Record<string, unknown>,
    );
    droppedKeys = safe.dropped;
    payloadPatch = safe.patch;
  }
  // Merges the patch in SQL (payload || patch), so a concurrent workshop write survives.
  const { data: rows, error } = await supabase.rpc(
    "patch_marketing_work_item",
    {
      p_item_id: args.item_id,
      p_tenant_id: tenantId,
      p_title: args.title != null ? String(args.title) : null,
      p_status: args.status != null ? String(args.status) : null,
      p_payload_patch: payloadPatch,
    } as Database["public"]["Functions"]["patch_marketing_work_item"]["Args"],
  );
  if (error) {
    throw error;
  }
  const updated = Array.isArray(rows) ? rows[0] : rows;
  if (!updated) {
    return { error: "עבודה לא נמצאה" };
  }
  if (droppedKeys.length === 0) {
    return { success: true, item: updated };
  }
  return {
    success: true,
    item: updated,
    ignored_payload_keys: droppedKeys,
    message: `לא עודכנו: ${droppedKeys.join(", ")}. את התקציב ואת מצב הפרויקט של הסדנה כותבת רק הסדנה עצמה.`,
  };
}
