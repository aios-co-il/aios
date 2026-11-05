/**
 * Who may send for a tenant from a WhatsApp line, over the service-role
 * client: a member of the tenant (tenant_users) or a super admin, and another
 * tenant's line only when it is shared with this tenant
 * (tenant_can_use_integration) or the sender is a super admin.
 * send-manus-wa-message, manage-manus-wa, run-ai-agent's staff alerts and
 * claude-notify's line choice apply this one rule. Every lookup throws an
 * Error naming the lookup when its query fails; an id that is not a uuid
 * matches nothing and is never queried.
 */

import { isSuperAdmin } from "../automation-run-auth.ts";
import type { DbClient } from "../supabase-clients.ts";
import { asUuidOrNull } from "../uuid.ts";

export type TenantUserAccess = { member: boolean; superAdmin: boolean };

/** A line as far as the sharing check needs it. */
export type LineRef = { id: string; tenant_id: string | null };

/** Whether the user is a member of the tenant and whether they are a super admin. */
export async function tenantUserAccess(
  sb: Pick<DbClient, "from" | "rpc">,
  tenantId: string,
  userId: string,
): Promise<TenantUserAccess> {
  const [member, superAdmin] = await Promise.all([
    isTenantMember(sb, tenantId, userId),
    isSuperAdminUser(sb, userId),
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
  if (!asUuidOrNull(tenantId) || !asUuidOrNull(integrationId)) {
    return false;
  }
  const { data, error } = await sb.rpc("tenant_can_use_integration", {
    p_tenant_id: tenantId,
    p_integration_id: integrationId,
  });
  if (error) {
    throw new Error(`tenant_can_use_integration failed: ${error.message}`);
  }
  return data === true;
}

/** Whether the user is a super admin (is_super_admin). */
export async function isSuperAdminUser(
  sb: Pick<DbClient, "rpc">,
  userId: string,
): Promise<boolean> {
  if (!asUuidOrNull(userId)) {
    return false;
  }
  try {
    return await isSuperAdmin(sb, userId);
  } catch (e) {
    // isSuperAdmin throws the PostgREST error object, which is not an Error.
    throw new Error(`is_super_admin failed: ${errorMessage(e)}`);
  }
}

/** Whether the user has a tenant_users row in the tenant; no tenant means no. */
async function isTenantMember(
  sb: Pick<DbClient, "from">,
  tenantId: string,
  userId: string,
): Promise<boolean> {
  if (!asUuidOrNull(tenantId) || !asUuidOrNull(userId)) {
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

/** The message of an Error or of a PostgREST error object. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (e && typeof e === "object" && "message" in e) {
    return typeof e.message === "string" ? e.message : JSON.stringify(e);
  }
  return String(e);
}
