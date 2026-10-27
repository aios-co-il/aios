/**
 * The approval's database reads and writes, always within the run's tenant:
 * the live finding by its code, the person's roles in the tenant, their
 * assignment to the client, and the card write with the finding's closing
 * (card-draft-write.ts).
 */
import { jerusalemYmd } from "../../_shared/calendarTimeZone.ts";
import { cardDraftWritePorts } from "../../_shared/manager-round/card-draft-write.ts";
import { FINDING_LIVE_STATUSES } from "../../_shared/manager-round/kinds.ts";
import type { DbClient } from "../../_shared/supabase-clients.ts";
import type { ApprovalPorts } from "./ports.ts";

/** The ports over the service-role client. */
export function approvalPorts(db: DbClient): ApprovalPorts {
  return {
    async findLive(tenantId, shortCode) {
      const { data, error } = await db
        .from("carmen_findings")
        .select("id, client_id, agency_id, short_code, owner_user_id, evidence")
        .eq("tenant_id", tenantId)
        .eq("short_code", shortCode)
        .in("status", [...FINDING_LIVE_STATUSES])
        .maybeSingle();
      throwIf(error, "carmen_findings");
      return data;
    },

    async approver(tenantId, userId) {
      const [roles, members, managed, profile] = await Promise.all([
        db
          .from("user_roles")
          .select("role")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId),
        db
          .from("tenant_users")
          .select("role")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId),
        db
          .from("user_managed_agencies")
          .select("agency_id")
          .eq("user_id", userId),
        db
          .from("profiles")
          .select("campaigner_id")
          .eq("id", userId)
          .maybeSingle(),
      ]);
      throwIf(roles.error, "user_roles");
      throwIf(members.error, "tenant_users");
      throwIf(managed.error, "user_managed_agencies");
      throwIf(profile.error, "profiles");
      return {
        userId,
        roles: [...(roles.data ?? []), ...(members.data ?? [])].map(
          (row) => row.role,
        ),
        managedAgencyIds: (managed.data ?? []).map((row) => row.agency_id),
        campaignerId: profile.data?.campaigner_id ?? null,
      };
    },

    async isAssigned(tenantId, clientId, campaignerId, now) {
      const { data, error } = await db
        .from("client_team")
        .select("start_date, end_date, campaigners!inner(tenant_id, active)")
        .eq("client_id", clientId)
        .eq("campaigner_id", campaignerId)
        .eq("campaigners.tenant_id", tenantId)
        .eq("campaigners.active", true);
      throwIf(error, "client_team");
      const today = jerusalemYmd(now);
      return (data ?? []).some(
        (row) =>
          (!row.start_date || row.start_date <= today) &&
          (!row.end_date || row.end_date >= today),
      );
    },

    write: cardDraftWritePorts(db),
  };
}

/** A failed read stops the approval; nothing has been written yet. */
function throwIf(error: { message: string } | null, what: string): void {
  if (error) {
    throw new Error(`${what}: ${error.message}`);
  }
}
