import type { ToolExecutionContext } from "../tool-context.ts";

import { scopeFrom } from "./scope.ts";
import { listClients } from "../executors/client-list.ts";

/** Preserves legacy routing for list_clients. */
export function legacyListClientsRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  const {
    supabase,
    tenantId,
    callerCampaignerId,
    surface,
    humanRequesterUserId,
  } = context;

  return listClients(args, {
    ...scopeFrom(context),
    supabase,
    tenantId,
    callerCampaignerId,
    humanRequesterUserId,
    surface,
  });
}
