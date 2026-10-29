/**
 * Who may make Carmen's Manus line send a message through manage-manus-wa.
 *
 * - This project's service-role key: accepted (run-ai-agent's gateway tool),
 *   with no tenant or primary-line check on the integrationId it names
 *   (AIO-248).
 * - A JWT with role "anon" (the public anon key): 401.
 * - A user JWT: the rule send-manus-wa-message applies
 *   (_shared/auth/tenant-access.ts) for the requested tenant, else the
 *   integration's tenant. Membership is checked first, so only a member or
 *   super admin learns that an integration id does not exist (404).
 * - Anything else: 401.
 */

import { bearerToken, callerUserId } from "../_shared/automation-run-auth.ts";
import { mayUseLine, tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { isServiceKey } from "../_shared/timing-safe-equal.ts";

export type ManusSendAuthInput = {
  authorization: string | null | undefined;
  serviceRoleKey: string;
  integration: { id: string; tenant_id: string | null } | null;
  requestedTenantId?: string | null;
  /** Service-role client for the caller, membership and sharing lookups. */
  supabase: Pick<DbClient, "auth" | "from" | "rpc">;
};

export type ManusSendAuthResult =
  | { ok: true; caller: "service_role" | "user"; userId: string | null }
  | { ok: false; status: 401 | 403 | 404; error: string };

/** Whether this caller may send from this integration; a failed lookup throws. */
export async function authorizeManusSend(
  input: ManusSendAuthInput,
): Promise<ManusSendAuthResult> {
  const token = bearerToken(input.authorization);
  if (!token) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (isServiceKey(token, input.serviceRoleKey)) {
    return { ok: true, caller: "service_role", userId: null };
  }
  const role = jwtRole(token);
  if (role === "anon" || role === "service_role") {
    // anon: the public key. service_role that is not this project's key: refuse.
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const userId = await callerUserId(input.supabase, token);
  if (!userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const integration = input.integration;
  const tenantId = input.requestedTenantId || integration?.tenant_id;
  if (!tenantId) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return authorizeTenantUser(input.supabase, tenantId, userId, integration);
}

/** True for the public anon key (or any other anon-role JWT). */
export function isAnonToken(
  token: string | null | undefined,
  serviceRoleKey: string,
): boolean {
  if (!token || isServiceKey(token, serviceRoleKey)) {
    return false;
  }
  return jwtRole(token) === "anon";
}

/** Reads the role claim of a JWT without verifying it (verify_jwt does that). */
export function jwtRole(token: string | null | undefined): string | null {
  const parts = (token || "").split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** A signed-in user: a member or super admin, and another tenant's integration only when shared. */
async function authorizeTenantUser(
  supabase: ManusSendAuthInput["supabase"],
  tenantId: string,
  userId: string,
  integration: ManusSendAuthInput["integration"],
): Promise<ManusSendAuthResult> {
  const access = await tenantUserAccess(supabase, tenantId, userId);
  if (!access.member && !access.superAdmin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (!integration) {
    return { ok: false, status: 404, error: "Integration not found" };
  }
  if (!(await mayUseLine(supabase, tenantId, access, integration))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, caller: "user", userId };
}
