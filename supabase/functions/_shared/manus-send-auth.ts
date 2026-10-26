/**
 * Who may make Carmen's Manus line send a message through manage-manus-wa.
 *
 * - This project's service-role key: accepted (run-ai-agent's gateway tool).
 * - A JWT with role "anon" (the public anon key): 401.
 * - A user JWT: the user must be a member of the integration's tenant (or of
 *   the requested tenant that may use a shared integration), or a super
 *   admin. Same rule as send-manus-wa-message.
 * - Anything else: 401.
 */

import { isServiceKey } from "./timing-safe-equal.ts";

export function bearerToken(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Reads the role claim of a JWT without verifying it (verify_jwt does that). */
export function jwtRole(token: string | null | undefined): string | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** True for the public anon key (or any other anon-role JWT). */
export function isAnonToken(
  token: string | null | undefined,
  serviceRoleKey: string,
): boolean {
  if (!token) return false;
  if (isServiceKey(token, serviceRoleKey)) return false;
  return jwtRole(token) === "anon";
}

export type ManusSendAuthDeps = {
  /** Verified user id for a user JWT, or null when the token is not a valid user session. */
  getUserId(token: string): Promise<string | null>;
  isTenantMember(tenantId: string, userId: string): Promise<boolean>;
  isSuperAdmin(userId: string): Promise<boolean>;
  tenantCanUseIntegration(
    tenantId: string,
    integrationId: string,
  ): Promise<boolean>;
};

export type ManusSendAuthResult =
  | { ok: true; caller: "service_role" | "user"; userId: string | null }
  | { ok: false; status: 401 | 403 | 404; error: string };

export async function authorizeManusSend(input: {
  authorization: string | null | undefined;
  serviceRoleKey: string;
  integration: { id: string; tenant_id: string | null } | null;
  requestedTenantId?: string | null;
  deps: ManusSendAuthDeps;
}): Promise<ManusSendAuthResult> {
  const token = bearerToken(input.authorization);
  if (!token) return { ok: false, status: 401, error: "Unauthorized" };
  if (isServiceKey(token, input.serviceRoleKey)) {
    return { ok: true, caller: "service_role", userId: null };
  }
  const role = jwtRole(token);
  if (role === "anon" || role === "service_role") {
    // anon: the public key. service_role that is not this project's key: refuse.
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const userId = await input.deps.getUserId(token);
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };

  const integration = input.integration;
  if (!integration) {
    return { ok: false, status: 404, error: "Integration not found" };
  }
  const tenantId = input.requestedTenantId || integration.tenant_id;
  if (!tenantId) return { ok: false, status: 403, error: "Forbidden" };

  const [member, superAdmin] = await Promise.all([
    input.deps.isTenantMember(tenantId, userId),
    input.deps.isSuperAdmin(userId),
  ]);
  if (!member && !superAdmin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (integration.tenant_id !== tenantId && !superAdmin) {
    const canUse = await input.deps.tenantCanUseIntegration(
      tenantId,
      integration.id,
    );
    if (!canUse) return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, caller: "user", userId };
}
