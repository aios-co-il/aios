import type { ToolExecutionContext, ToolScope } from "../tool-context.ts";

/** Reconstructs the verified scope projected by the original case adapters. */
export function scopeFrom(context: ToolExecutionContext): ToolScope {
  const {
    actorUserId,
    devEscalationTier,
    accessibleTenantIds,
    isManagerRole,
    isTeamManager,
    managedAgencyIds,
    bypassCampaignerScope,
    canManageAutomations,
    callerScope,
  } = context;
  return {
    actorUserId,
    devEscalationTier,
    accessibleTenantIds,
    isManagerRole,
    isTeamManager,
    managedAgencyIds,
    bypassCampaignerScope,
    canManageAutomations,
    callerScope,
  };
}
