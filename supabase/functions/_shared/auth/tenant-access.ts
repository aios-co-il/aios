/**
 * Who may send for a tenant from a WhatsApp line, over the service-role
 * client: a member of the tenant (tenant_users) or a super admin, and another
 * tenant's line only when it is shared with this tenant
 * (tenant_can_use_integration). send-manus-wa-message, manage-manus-wa and
 * run-ai-agent's staff alerts apply this one rule; claude-notify applies the
 * sharing half to the lines its steps name. Every lookup throws when its
 * query fails.
 */

import { isSuperAdmin } from "../automation-run-auth.ts";
import type { DbClient } from "../supabase-clients.ts";

export type TenantUserAccess = { member: boolean; superAdmin: boolean };

/** A line as far as the sharing check needs it. */
export type LineRef = { id: string; tenant_id: string | null };

/** Whether the user is a member of the tenant and whether they are a super admin. */
export async function tenantUserAccess(
  sb: Pick<DbClient, "auth" | "from" | "rpc">,
  tenantId: string,
  userId: string,
): Promise<TenantUserAccess> {
  const [member, superAdmin] = await Promise.all([
    isTenantMember(sb, tenantId, userId),
    isSuperAdmin(sb, userId),
  ]);
  return { member, superAdmin };
}

/** Whether a caller with this access may send for the tenant from the line: a super admin from any line, anyone else from the tenant's own line or one shared with it. */
export async function mayUseLine(
  sb: Pick<DbClient, "rpc">,
  tenantId: string,
  access: TenantUserAccess,
  line: LineRef,
): Promise<boolean> {
  if (access.superAdmin || line.tenant_id === tenantId) {
    return true;
  }
  return await tenantCanUseIntegration(sb, tenantId, line.id);
}

/** Whether the tenant may use the line: its own or one shared with it, and active (tenant_can_use_integration). */
export async function tenantCanUseIntegration(
  sb: Pick<DbClient, "rpc">,
  tenantId: string,
  integrationId: string,
): Promise<boolean> {
  const { data, error } = await sb.rpc("tenant_can_use_integration", {
    p_tenant_id: tenantId,
    p_integration_id: integrationId,
  });
  if (error) {
    throw new Error(`tenant_can_use_integration failed: ${error.message}`);
  }
  return data === true;
}

/** Whether the user has a tenant_users row in the tenant; no tenant means no. */
async function isTenantMember(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  if (!tenantId) {
    return false;
  }
  const { data, error } = await sb
    .from("tenant_users")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .limit(1);
  if (error) {
    throw new Error(`tenant_users lookup failed: ${error.message}`);
  }
  return (data ?? []).length > 0;
}
