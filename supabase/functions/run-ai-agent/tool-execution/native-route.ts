import type { ToolExecutionContext } from "../tool-context.ts";
import { isVideoDirectorTool } from "../../_shared/video-director-tools.ts";
import { executeVideoDirectorTool } from "../../_shared/video-director-tools.ts";
import { assertCallerCanAccessClient } from "../../_shared/auth-helpers.ts";
import { isCardDraftTool } from "../card-draft-approval/tool.ts";
import { executeCardDraftTool } from "../card-draft-approval/tool.ts";
import { isCreativeStudioTool } from "../../_shared/creative-studio-tools.ts";
import { executeCreativeStudioTool } from "../../_shared/creative-studio-tools.ts";
import { isFindingDraftTool } from "../finding-draft/tool.ts";
import { executeFindingDraftTool } from "../finding-draft/tool.ts";
import { isPulseTargetTool } from "../../_shared/carmen/pulse-targets/tool-defs.ts";
import { executePulseTargetTool } from "../../_shared/carmen/pulse-targets/execute.ts";

/** Keeps native feature checks in their original order before named switch routes. */
export function nativeToolRoute(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): { result: unknown } | undefined {
  const {
    supabase,
    tenantId,
    callerCampaignerId,
    agentId,
    callerRole,
    callerPhone,
    humanRequesterUserId,
    findingDraftReply,
    actorUserId,
    accessibleTenantIds,
    isManagerRole,
    isTeamManager,
    managedAgencyIds,
    callerScope,
    name,
  } = context;
  if (isVideoDirectorTool(name)) {
    return {
      result: executeVideoDirectorTool(
        supabase as unknown as Parameters<typeof executeVideoDirectorTool>[0],
        tenantId,
        name,
        args,
        (clientId) =>
          assertCallerCanAccessClient(supabase, clientId, callerScope),
      ),
    };
  }
  if (isCardDraftTool(name)) {
    return {
      result: executeCardDraftTool(supabase, {
        tenantId,
        args,
        requesterUserId: humanRequesterUserId ?? null,
        reply: findingDraftReply ?? null,
      }),
    };
  }
  if (isCreativeStudioTool(name)) {
    return {
      result: executeCreativeStudioTool(
        supabase,
        tenantId,
        name,
        args,
        (clientId) =>
          assertCallerCanAccessClient(supabase, clientId, callerScope),
      ),
    };
  }
  if (isFindingDraftTool(name)) {
    return {
      result: executeFindingDraftTool(supabase, {
        tenantId,
        args,
        requesterUserId: humanRequesterUserId ?? null,
        reply: findingDraftReply ?? null,
      }),
    };
  }
  if (isPulseTargetTool(name)) {
    return {
      result: executePulseTargetTool(
        supabase,
        {
          tenantId,
          accessibleTenantIds,
          actorUserId,
          agentId: agentId || null,
          callerRole: callerRole || null,
          callerPhone: callerPhone || null,
          isManagerRole,
          isTeamManager,
          managedAgencyIds,
          callerCampaignerId: callerCampaignerId || null,
          assertClientAccess: (clientId) =>
            assertCallerCanAccessClient(supabase, clientId, callerScope),
        },
        name,
        args,
      ),
    };
  }
}
