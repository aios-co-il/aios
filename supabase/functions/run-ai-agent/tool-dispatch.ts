import { asUuidOrNull } from "../_shared/uuid.ts";
import {
  DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE,
  DEV_ESCALATION_REFUSAL_HE,
  isDevEscalationTool,
  isDevEscalationToolAllowed,
} from "../_shared/dev-escalation-auth.ts";
import { MANAGER_ROLES } from "../_shared/carmen/manager-roles.ts";
import type {
  ToolCaller,
  ToolDispatchDependencies,
  ToolScope,
} from "./tool-context.ts";

/** Resolves caller scope only after the existing developer escalation guard. */
export async function prepareToolDispatch(
  name: string,
  caller: ToolCaller,
  dependencies: ToolDispatchDependencies,
): Promise<
  { scope: ToolScope } | { refusal: { error: string; message: string } }
> {
  // WhatsApp / automations may pass "system"; UUID columns must receive null.
  const actorUserId = asUuidOrNull(caller.userId);
  const devEscalationTier = await dependencies.loadTier({
    tenantId: caller.tenantId,
    agentId: caller.agentId || null,
    userId: actorUserId,
    campaignerId: caller.callerCampaignerId || null,
    phone: caller.callerPhone || null,
  });
  if (
    isDevEscalationTool(name) &&
    !isDevEscalationToolAllowed(name, devEscalationTier)
  ) {
    return {
      refusal: {
        error: "dev_escalation_forbidden",
        message:
          devEscalationTier === "bugfix"
            ? DEV_ESCALATION_BUGFIX_ONLY_REFUSAL_HE
            : DEV_ESCALATION_REFUSAL_HE,
      },
    };
  }
  const accessibleTenantIds = await dependencies.accessibleTenants(
    caller.tenantId,
  );
  // Preserve callerRole's current cross-tenant meaning until AIO-275 scopes it.
  const isManagerRole =
    !!caller.callerRole && MANAGER_ROLES.includes(caller.callerRole);
  const isTeamManager = caller.callerRole === "team_manager";
  const managedAgencyIds = Array.isArray(caller.callerManagedAgencyIds)
    ? caller.callerManagedAgencyIds
    : [];
  return {
    scope: {
      actorUserId,
      devEscalationTier,
      accessibleTenantIds,
      isManagerRole,
      isTeamManager,
      managedAgencyIds,
      bypassCampaignerScope:
        isManagerRole || (isTeamManager && managedAgencyIds.length > 0),
      canManageAutomations: isManagerRole || isTeamManager,
      callerScope: {
        callerCampaignerId: caller.callerCampaignerId,
        isManagerRole,
        isTeamManager,
        managedAgencyIds,
        accessibleTenantIds,
      },
    },
  };
}
