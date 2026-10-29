/**
 * Who may call carmen-fb-tools / carmen-google-tools (AIO-239).
 *
 * - This project's service-role key: carmen-approval-execute,
 *   campaign-scheduler-cron and the client campaign shutdown runner. The body
 *   tenant_id stands: the service role is trusted to name the tenant. Note
 *   that carmen-approval-execute spreads the stored tool_input after the
 *   approval row's tenant_id, so a tool_input.tenant_id currently wins there.
 * - A user JWT: the tenant is the user's active tenant (get_user_tenant_id),
 *   confirmed against tenant_users; a body tenant_id is ignored. Reads need
 *   membership; writes need owner, agency_owner or super_admin (a super admin
 *   only where tenants.allow_super_admin_access is on, as in RLS). Every
 *   target must pass ./scope.ts for that tenant, and Meta calls use only that
 *   tenant's own token (fbTokenSource in ./fb-gate.ts).
 * - Anything else (no bearer, the anon key, a foreign or invalid JWT): 401.
 */
import { bearerFrom, jwtRole } from "../auth/edge-caller-auth.ts";
import { isServiceKey } from "../timing-safe-equal.ts";
import { type AdToolDenied, denied } from "./denials.ts";
import type { AdScopeStore, AdToolAccess } from "./scope.ts";

type AdToolFunction = "carmen-fb-tools" | "carmen-google-tools";

export type AdToolCaller =
  | { kind: "service_role"; tenantId: string }
  | { kind: "user"; userId: string; tenantId: string; isApprover: boolean };

export type AdToolIdentity = {
  /** Verified user id for a user JWT; null when it is not a valid session. */
  getUserId(token: string): Promise<string | null>;
  activeTenantId(userId: string): Promise<string | null>;
  /** The user's roles in the tenant, or null when they are not a member. */
  tenantRoles(userId: string, tenantId: string): Promise<string[] | null>;
  isSuperAdmin(userId: string): Promise<boolean>;
  /** tenants.allow_super_admin_access, which the RLS super-admin policies honour. */
  allowsSuperAdmin(tenantId: string): Promise<boolean>;
};

export type AdToolAuthResult =
  { ok: true; caller: AdToolCaller } | AdToolDenied;

/** What the fb and google gates take from their handler. */
export type AdToolGateInput = {
  authorization: string | null | undefined;
  serviceRoleKey: string;
  body: Record<string, unknown>;
  identity: AdToolIdentity;
  store: AdScopeStore;
};

/** Bearer → this project's service role (body tenant trusted) → a user JWT
 * (own tenant; an approver role for writes). Anything else gets 401. */
export async function authorizeAdToolCaller(input: {
  authorization: string | null | undefined;
  serviceRoleKey: string;
  bodyTenantId: unknown;
  access: AdToolAccess;
  identity: AdToolIdentity;
}): Promise<AdToolAuthResult> {
  const token = bearerFrom(input.authorization);
  if (!token) {
    return denied(401, "unauthorized");
  }
  if (isServiceKey(token, input.serviceRoleKey.trim())) {
    return serviceRoleCaller(input.bodyTenantId);
  }
  // The public anon key, or a service-role JWT that is not this project's.
  const role = jwtRole(token);
  if (role === "anon" || role === "service_role") {
    return denied(401, "unauthorized");
  }
  return userCaller(token, input.access, input.identity);
}

/** authorizeAdToolCaller for a gate's input and the access its action needs. */
export function authorizeGateCaller(
  input: AdToolGateInput,
  access: AdToolAccess,
): Promise<AdToolAuthResult> {
  return authorizeAdToolCaller({
    authorization: input.authorization,
    serviceRoleKey: input.serviceRoleKey,
    bodyTenantId: input.body.tenant_id,
    access,
    identity: input.identity,
  });
}

/** "read" only for an action listed in READ_ONLY_ACTIONS, else "write". */
export function adToolAccess(
  fn: AdToolFunction,
  action: unknown,
): AdToolAccess {
  const read = typeof action === "string" && READ_ONLY_ACTIONS[fn].has(action);
  return read ? "read" : "write";
}

/** The service role names the tenant in the body. */
function serviceRoleCaller(bodyTenantId: unknown): AdToolAuthResult {
  if (typeof bodyTenantId !== "string" || !bodyTenantId.trim()) {
    return denied(400, "tenant_id and action required");
  }
  return { ok: true, caller: { kind: "service_role", tenantId: bodyTenantId } };
}

/** A valid session, an active tenant they belong to (or a super admin where
 * the tenant allows it), and an approver role for writes. */
async function userCaller(
  token: string,
  access: AdToolAccess,
  identity: AdToolIdentity,
): Promise<AdToolAuthResult> {
  const userId = await identity.getUserId(token);
  if (!userId) {
    return denied(401, "unauthorized");
  }
  const [isSuperAdmin, tenantId] = await Promise.all([
    identity.isSuperAdmin(userId),
    identity.activeTenantId(userId),
  ]);
  if (!tenantId) {
    return denied(403, "no_active_tenant", "לא נמצא ארגון פעיל למשתמש.");
  }
  const superAdmin =
    isSuperAdmin && (await identity.allowsSuperAdmin(tenantId));
  const roles = await identity.tenantRoles(userId, tenantId);
  if (!roles && !superAdmin) {
    return denied(403, "not_tenant_member", "המשתמש לא משויך לארגון הפעיל.");
  }
  const isApprover =
    superAdmin || (roles ?? []).some((r) => AD_TOOL_APPROVER_ROLES.includes(r));
  if (access === "write" && !isApprover) {
    return denied(
      403,
      "approver_role_required",
      "רק בעלים, בעל סוכנות או סופר אדמין יכולים לשנות קמפיינים, מודעות ותקציבים.",
    );
  }
  return { ok: true, caller: { kind: "user", userId, tenantId, isApprover } };
}

const AD_TOOL_APPROVER_ROLES: readonly string[] = [
  "owner",
  "agency_owner",
  "super_admin",
];

/** Every action of both functions changes a campaign, ad or budget today. A
 * read-only action is listed here when one is added; anything not listed
 * (unknown actions included) needs an approver. */
const READ_ONLY_ACTIONS: Record<AdToolFunction, ReadonlySet<string>> = {
  "carmen-fb-tools": new Set<string>(),
  "carmen-google-tools": new Set<string>(),
};
