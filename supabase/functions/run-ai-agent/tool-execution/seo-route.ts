import type { ToolExecutionContext } from "../tool-context.ts";
import { isSeoReadTool } from "../../_shared/carmen/seo-read-tools.ts";
import { executeSeoReadTool } from "../seo-read/execute.ts";
import { isSeoActionTool } from "../../_shared/carmen/seo-action-tools.ts";
import { executeSeoActionTool } from "../seo-actions/execute.ts";
import { invokeServiceFunction } from "../seo-actions/invoke.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";

/** Route SEO tools through the existing scoped read and approval boundaries. */
export function seoToolRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): { result: unknown } | undefined {
  const {
    supabase,
    tenantId,
    accessibleTenantIds,
    callerScope,
    name,
    actorUserId,
    agentId,
    approval,
  } = context;
  if (isSeoReadTool(name)) {
    return {
      result: executeSeoReadTool(
        supabase,
        {
          tenantId,
          accessibleTenantIds,
          assertClientAccess: (clientId) =>
            assertCallerCanAccessClient(supabase, clientId, callerScope),
        },
        name,
        args,
      ),
    };
  }
  if (isSeoActionTool(name)) {
    return {
      result: executeSeoActionTool(
        supabase,
        {
          tenantId,
          accessibleTenantIds,
          assertClientAccess: (clientId) =>
            assertCallerCanAccessClient(supabase, clientId, callerScope),
          actorUserId,
          agentId: agentId || null,
          approved: approval.outOfBand === true,
          invoke: invokeServiceFunction,
        },
        name,
        args,
      ),
    };
  }
}
