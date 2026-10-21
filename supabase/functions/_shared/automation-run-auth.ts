/** Who may run one specific automation by id (trigger-automation's
 * `automationId` mode, used for tests, manual triggers and reruns).
 *
 * The service role (internal callers, cron, webhooks) always may. A signed-in
 * user may only when RLS would let them manage the automation: the owner of
 * its tenant, or a super admin (policy "Owners can manage automations").
 */
import type { DbClient } from "./supabase-clients.ts";

/** Result of the check: run it, or the HTTP status and error to return. */
export type DirectRunDecision =
  { allowed: true } | { allowed: false; status: 401 | 403; error: string };

export function bearerToken(authHeader: string | null | undefined): string {
  return (authHeader || "").replace(/^Bearer\s+/i, "").trim();
}

export async function authorizeDirectAutomationRun(
  supabase: Pick<DbClient, "auth" | "rpc">,
  token: string,
  serviceKey: string,
  automationTenantId: string,
): Promise<DirectRunDecision> {
  if (token && serviceKey && token === serviceKey) return { allowed: true };

  const { data: userData, error: userError } = token
    ? await supabase.auth.getUser(token)
    : { data: null, error: new Error("missing token") };
  const userId = userData?.user?.id;
  if (userError || !userId) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }

  const tenant = await supabase.rpc("get_user_tenant_id", { _user_id: userId });
  if (tenant.error) throw tenant.error;
  if (tenant.data === automationTenantId) {
    const owner = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "owner",
    });
    if (owner.error) throw owner.error;
    if (owner.data === true) return { allowed: true };
  }

  const admin = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (admin.error) throw admin.error;
  if (admin.data === true) return { allowed: true };

  return {
    allowed: false,
    status: 403,
    error: "Only the tenant owner can run this automation directly",
  };
}
