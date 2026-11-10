import type { RunState } from "./state.ts";
import { runCallerPhone } from "../caller-trust.ts";
import { CALLER_ROLE_PRIORITY } from "../caller-roles.ts";
import { MANAGER_ROLES } from "../manager-roles.ts";
import { resolveHumanRequesterUserId } from "../client-card-contact-policy.ts";
import { findingDraftReplyOf } from "../finding-draft/reply.ts";
import { loadDevEscalationTierFromDb } from "../../_shared/carmen-access-policy.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
/** resolve Run Caller in the original run order. */
export async function resolveRunCaller(
  run: RunState,
): Promise<Response | string | void> {
  run.callerCampaignerId = null;
  run.callerName = run.user_name || null;
  run.callerPhone = runCallerPhone(run.input.bodyJson);
  if (run.callerPhone && run.resolvedTenantId) {
    // Normalize: take last 9 digits for comparison
    const normalizedPhone = run.callerPhone.replace(/[^0-9]/g, "").slice(-9);
    if (normalizedPhone.length >= 9) {
      const { data: matchedCampaigners } = await run.supabase
        .from("campaigners")
        .select("id, full_name, phone")
        .eq("tenant_id", run.resolvedTenantId)
        .eq("active", true);
      if (matchedCampaigners) {
        const match = matchedCampaigners.find((c) => {
          if (!c.phone) {
            return false;
          }
          const cNorm = c.phone.replace(/[^0-9]/g, "").slice(-9);
          return cNorm === normalizedPhone;
        });
        if (match) {
          run.callerCampaignerId = match.id;
          run.callerName = match.full_name;
          console.log(
            `[AGENT] Resolved caller phone ${run.callerPhone} → campaigner: ${match.full_name} (${match.id})`,
          );
        }
      }
    }
  }
  run.callerRole = null;
  run.callerUserId = null;
  run.callerManagedAgencyIds = [];
  if (run.callerCampaignerId) {
    const { data: prof } = await run.supabase
      .from("profiles")
      .select("id")
      .eq("campaigner_id", run.callerCampaignerId)
      .maybeSingle();
    run.callerUserId = prof?.id || null;
  }
  if (
    !run.callerUserId &&
    run.resolvedUserId &&
    run.resolvedUserId !== "system"
  ) {
    run.callerUserId = run.resolvedUserId;
  }
  if (run.callerUserId) {
    const { data: roles, error: rolesError } = await run.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", run.callerUserId)
      .or(`tenant_id.eq.${run.resolvedTenantId},tenant_id.is.null`);
    if (rolesError) {
      throw rolesError;
    }
    const roleList: Array<string> = (roles || []).map((r) => r.role);
    // Priority order
    for (const r of CALLER_ROLE_PRIORITY) {
      if (roleList.includes(r)) {
        run.callerRole = r;
        break;
      }
    }
    if (
      run.callerRole === "team_manager" ||
      run.callerRole === "agency_manager"
    ) {
      const { data: mng } = await run.supabase
        .from("user_managed_agencies")
        .select("agency_id")
        .eq("user_id", run.callerUserId);
      run.callerManagedAgencyIds = (mng || []).map((m) => m.agency_id);
    }
    console.log(
      `[AGENT] Caller role: ${run.callerRole} (user_id=${run.callerUserId}, managed_agencies=${run.callerManagedAgencyIds.length})`,
    );
  }
  run.isManagerRoleCaller =
    !!run.callerRole && MANAGER_ROLES.includes(run.callerRole);
  run.isTeamManagerCaller = run.callerRole === "team_manager";
  run.humanRequesterUserId = resolveHumanRequesterUserId({
    userId: run.callerUserId,
    surface: run.input.surface,
    automationId: run.automation_id,
  });
  run.findingDraftReply = findingDraftReplyOf(run.command_text, run.wa_notify);
  run.devEscalationTier = await loadDevEscalationTierFromDb(run.supabase, {
    tenantId: run.resolvedTenantId,
    agentId: run.agent_id || null,
    userId: run.callerUserId || asUuidOrNull(run.resolvedUserId),
    campaignerId: run.callerCampaignerId,
    phone: run.callerPhone,
  });
  run.canEscalateDevFixes = run.devEscalationTier !== null;
  console.log(
    `[AGENT] Dev-escalation tier=${run.devEscalationTier ?? "none"} (campaigner=${run.callerCampaignerId || "none"}, phone=${run.callerPhone || "none"})`,
  );
}
