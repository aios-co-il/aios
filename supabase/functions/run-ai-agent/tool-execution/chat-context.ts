import type { ToolExecutionContext } from "../tool-context.ts";
import type { ChatReadContext } from "../chat-scope/scoped-read.ts";

/** Chat readers use the verified caller, never tool arguments or cross-tenant role flags. */
export function createChatReadContext(
  context: ToolExecutionContext,
): ChatReadContext {
  const {
    supabase,
    tenantId,
    accessibleTenantIds,
    actorUserId,
    callerCampaignerId,
    waNotify,
  } = context;
  return {
    supabase,
    scopeInput: {
      tenantId,
      accessibleTenantIds,
      userId: actorUserId,
      callerCampaignerId: callerCampaignerId ?? null,
      waNotify,
    },
  };
}
