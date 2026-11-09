import type { ListUpdatesArgs } from "./business-record-inputs.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { listUpdates } from "../list-updates.ts";

/** Preserves the existing list_updates executor and side-effect order. */
export async function executeListUpdates(
  args: ListUpdatesArgs,
  context: ToolExecutionContext,
) {
  const { supabase, tenantId, accessibleTenantIds, callerScope } = context;

  if (args.entity_type === "client") {
    await assertCallerCanAccessClient(supabase, args.entity_id, callerScope);
  }
  return await listUpdates(supabase, {
    entityType: args.entity_type,
    entityId: args.entity_id,
    tenantId,
    accessibleTenantIds,
    limit: args.limit,
  });
}
