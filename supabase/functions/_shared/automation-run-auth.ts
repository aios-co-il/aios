/** Who may run one specific automation by id (trigger-automation's
 * `automationId` mode, used for tests, manual triggers and reruns).
 *
 * The service role (internal callers, cron, webhooks) always may. A signed-in
 * user may only when RLS would let them manage the automation: the owner of
 * its tenant, or a super admin (policy "Owners can manage automations").
 * `authorizeTenantCaller` covers the generic trigger-type path.
 */
import type { DbClient } from "./supabase-clients.ts";
import { isServiceKey } from "./timing-safe-equal.ts";

/**
 * Who the request proved to be: the service role, or a signed-in user. A run a
 * user started must not take its identity from the payload (AIO-241).
 */
export type RunCaller = { kind: "service" } | { kind: "user"; userId: string };

/** Result of the check: run it as this caller, or the HTTP status and error to return. */
export type DirectRunDecision =
  | { allowed: true; caller: RunCaller }
  | { allowed: false; status: 400 | 401 | 403; error: string };

const SERVICE_CALLER: RunCaller = Object.freeze({ kind: "service" });

type AuthRpcClient = Pick<DbClient, "auth" | "rpc">;

async function callerUserId(
  supabase: AuthRpcClient,
  token: string,
): Promise<string | null> {
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : (data?.user?.id ?? null);
}

async function isSuperAdmin(supabase: Pick<DbClient, "rpc">, userId: string) {
  const admin = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (admin.error) throw admin.error;
  return admin.data === true;
}

export function bearerToken(authHeader: string | null | undefined): string {
  return (authHeader || "").replace(/^Bearer\s+/i, "").trim();
}

export async function authorizeDirectAutomationRun(
  supabase: Pick<DbClient, "auth" | "rpc">,
  token: string,
  serviceKey: string,
  automationTenantId: string | null,
): Promise<DirectRunDecision> {
  if (isServiceKey(token, serviceKey)) {
    return { allowed: true, caller: SERVICE_CALLER };
  }

  const userId = await callerUserId(supabase, token);
  if (!userId) return { allowed: false, status: 401, error: "Unauthorized" };

  const tenant = await supabase.rpc("get_user_tenant_id", { _user_id: userId });
  if (tenant.error) throw tenant.error;
  if (tenant.data === automationTenantId) {
    const owner = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "owner",
    });
    if (owner.error) throw owner.error;
    if (owner.data === true) {
      return { allowed: true, caller: { kind: "user", userId } };
    }
  }

  if (await isSuperAdmin(supabase, userId)) {
    return { allowed: true, caller: { kind: "user", userId } };
  }

  return {
    allowed: false,
    status: 403,
    error: "Only the tenant owner can run this automation directly",
  };
}

/** Who may fire automations for a tenant by trigger type (the generic path,
 * where the body names the `tenant_id`). The service role always may; a
 * signed-in user only for a tenant they belong to, or as a super admin.
 * `asCaller` builds a client acting as the caller, so membership is checked
 * the same way RLS checks it. */
export async function authorizeTenantCaller(
  service: AuthRpcClient,
  asCaller: (authHeader: string) => Pick<DbClient, "rpc">,
  authHeader: string | null,
  serviceKey: string,
  tenantId: unknown,
): Promise<DirectRunDecision> {
  const token = bearerToken(authHeader);
  if (isServiceKey(token, serviceKey)) {
    return { allowed: true, caller: SERVICE_CALLER };
  }

  const userId = await callerUserId(service, token);
  if (!userId) return { allowed: false, status: 401, error: "Unauthorized" };
  if (typeof tenantId !== "string" || !tenantId) {
    return { allowed: false, status: 400, error: "missing_tenant_id" };
  }

  const member = await asCaller(authHeader ?? "").rpc("user_is_tenant_member", {
    check_tenant_id: tenantId,
  });
  if (member.error) throw member.error;
  if (member.data === true) {
    return { allowed: true, caller: { kind: "user", userId } };
  }

  if (await isSuperAdmin(service, userId)) {
    return { allowed: true, caller: { kind: "user", userId } };
  }

  return {
    allowed: false,
    status: 403,
    error: "Not a member of this tenant",
  };
}

// The same caller and super-admin lookups gate the Manus senders
// (_shared/auth/tenant-access.ts, manage-manus-wa/send-auth.ts).
export { callerUserId, isSuperAdmin };
