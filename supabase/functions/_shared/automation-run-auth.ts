/** Who may run one specific automation by id (trigger-automation's
 * `automationId` mode, used for tests, manual triggers and reruns).
 *
 * The service role (internal callers, cron, webhooks) always may. A signed-in
 * user may only when RLS would let them manage the automation: the owner of
 * its tenant, or a super admin (policy "Owners can manage automations").
 */

export type DirectRunDecision =
  { allowed: true } | { allowed: false; status: 401 | 403; error: string };

// deno-lint-ignore no-explicit-any
type Client = any;

export function bearerToken(authHeader: string | null | undefined): string {
  return (authHeader || "").replace(/^Bearer\s+/i, "").trim();
}

/** role claim of a JWT, without verifying it. Only meaningful behind
 * verify_jwt = true, where the gateway has already checked the signature. */
export function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const role = JSON.parse(json)?.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

export async function authorizeDirectAutomationRun(
  supabase: Client,
  token: string,
  serviceKey: string,
  automationTenantId: string,
): Promise<DirectRunDecision> {
  if (token && serviceKey && token === serviceKey) return { allowed: true };
  if (jwtRole(token) === "service_role") return { allowed: true };

  const { data: userData, error: userError } = token
    ? await supabase.auth.getUser(token)
    : { data: null, error: new Error("missing token") };
  const userId: string | undefined = userData?.user?.id;
  if (userError || !userId) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }

  const rpcValue = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  const tenantId = await rpcValue("get_user_tenant_id", { _user_id: userId });
  if (
    tenantId === automationTenantId &&
    (await rpcValue("has_role", { _user_id: userId, _role: "owner" })) === true
  ) {
    return { allowed: true };
  }

  if ((await rpcValue("is_super_admin", { _user_id: userId })) === true) {
    return { allowed: true };
  }

  return {
    allowed: false,
    status: 403,
    error: "Only the tenant owner can run this automation directly",
  };
}
