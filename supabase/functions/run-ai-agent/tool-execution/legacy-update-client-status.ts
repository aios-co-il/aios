import type { ToolExecutionContext } from "../tool-context.ts";

import { scopeFrom } from "./scope.ts";
import { executeClientRecordTool } from "../executors/client-records.ts";

/** Preserves legacy routing for create_client, update_client, update_client_status. */
export function legacyUpdateClientStatusRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const {
    supabase,
    tenantId,
    callerCampaignerId,
    surface,
    humanRequesterUserId,
    name,
  } = context;

  return executeClientRecordTool(
    { name, args } as Parameters<typeof executeClientRecordTool>[0],
    {
      ...scopeFrom(context),
      supabase,
      tenantId,
      callerCampaignerId,
      humanRequesterUserId,
      surface,
    },
  );
}
