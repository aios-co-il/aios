import { executeWithContext } from "./dispatch.ts";
import type { AgentDatabaseClient } from "../database-contracts.ts";
import type { ToolApproval } from "../tool-context.ts";
import type { FindingDraftReply } from "../finding-draft/reply.ts";
import { prepareToolDispatch } from "../tool-dispatch.ts";
import { loadDevEscalationTierFromDb } from "../../_shared/carmen-access-policy.ts";
import { getAccessibleTenantIds } from "./tenants.ts";
import type { ToolExecutionContext } from "../tool-context.ts";
import { SUPABASE_URL } from "../runtime.ts";
import { SUPABASE_SERVICE_ROLE_KEY } from "../runtime.ts";

/** Prepares verified caller and tenant scope before either normal or direct tool dispatch. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  supabase: AgentDatabaseClient,
  tenantId: string,
  userId: string | null,
  callerCampaignerId?: string | null,
  agentId?: string | null,
  callerRole?: string | null,
  callerManagedAgencyIds?: Array<string> | null,
  callerPhone?: string | null,
  waNotify?: ToolExecutionContext["waNotify"],
  surface?: string | null,
  conversationId?: string | null,
  approval: ToolApproval = {},
  /** The chat's app origin (request Origin), for full links to files the app serves. */
  appLinkOrigin?: string | null,
  // The person talking to Carmen in this run (resolveHumanRequesterUserId).
  // Omitted = nobody can vouch for a client contact, so calls are not logged.
  humanRequesterUserId?: string | null,
  // The "תעדי <code>" this run answers (confirm_finding_draft); omitted = none.
  findingDraftReply?: FindingDraftReply | null,
): Promise<unknown> {
  const prepared = await prepareToolDispatch(
    name,
    {
      tenantId,
      userId,
      callerCampaignerId,
      agentId,
      callerRole,
      callerManagedAgencyIds,
      callerPhone,
    },
    {
      loadTier: (caller) => loadDevEscalationTierFromDb(supabase, caller),
      accessibleTenants: (id) => getAccessibleTenantIds(supabase, id),
    },
  );
  if ("refusal" in prepared) {
    return prepared.refusal;
  }

  const toolContext: ToolExecutionContext = {
    ...prepared.scope,
    supabase,
    tenantId,
    userId,
    name,
    waNotify,
    callerCampaignerId,
    agentId,
    callerRole,
    callerManagedAgencyIds,
    callerPhone,
    surface,
    conversationId,
    approval,
    appLinkOrigin,
    humanRequesterUserId,
    findingDraftReply,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  };
  return executeWithContext(args, toolContext, executeTool);
}
