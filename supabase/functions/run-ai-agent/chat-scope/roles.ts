import type { DbClient } from "../../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../../_shared/uuid.ts";
import { uuids } from "./ids.ts";
import { queryRows } from "./query-rows.ts";

/** Highest first: the order run-ai-agent uses to pick a caller's role. */
export const ROLE_PRIORITY = [
  "super_admin",
  "owner",
  "agency_owner",
  "agency_manager",
  "team_manager",
  "campaigner",
  "sales_person",
  "seo",
  "viewer",
];

/** Roles that keep today's tenant-wide chat access. */
const FULL_ROLES = ["owner", "super_admin"];

/** Staff who see every client- and lead-linked thread of the tenant. */
const TENANT_ROLES = ["agency_owner", "agency_manager"];

const MEMBER_ROLES = ["campaigner", "sales_person", "seo", "viewer"];

/**
 * The chat tier of a role in this tenant (tenantRoleFor). A matched campaigner
 * record without a role still counts as a campaigner, as in
 * assertCallerCanAccessClient.
 */
export function chatRoleTier(
  tenantRole: string | null | undefined,
  callerCampaignerId?: string | null,
): "full" | "tenant" | "team" | "member" | null {
  const role = tenantRole ?? "";
  if (FULL_ROLES.includes(role)) {
    return "full";
  }

  if (TENANT_ROLES.includes(role)) {
    return "tenant";
  }

  if (role === "team_manager") {
    return "team";
  }

  if (MEMBER_ROLES.includes(role) || asUuidOrNull(callerCampaignerId)) {
    return "member";
  }

  return null;
}

/**
 * The user's highest role in this tenant, counting global (tenant_id null)
 * roles too, as resolveDirectCaller in run-ai-agent does. A role the user
 * holds in another tenant never counts.
 */
export async function tenantRoleFor(
  supabase: Pick<DbClient, "from">,
  tenantId: string,
  userId: string,
): Promise<string | null> {
  const tenant = asUuidOrNull(tenantId);
  const user = asUuidOrNull(userId);
  if (!tenant || !user) {
    return null;
  }

  const found = await queryRows(
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user)
      .or(`tenant_id.eq.${tenant},tenant_id.is.null`),
  );
  const roles: string[] = found.map((r) => r.role);
  return ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
}

/** Agencies the user manages as a team manager (user_managed_agencies). */
export async function managedAgencyIdsFor(
  supabase: Pick<DbClient, "from">,
  userId: string,
): Promise<string[]> {
  const found = await queryRows(
    supabase
      .from("user_managed_agencies")
      .select("agency_id")
      .eq("user_id", userId),
  );
  return uuids(found.map((r) => r.agency_id));
}
