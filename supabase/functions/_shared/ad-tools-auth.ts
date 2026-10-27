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
 *   target must pass ./ad-tools-scope.ts for that tenant, and Meta calls use
 *   only that tenant's own token (fbTokenSource).
 * - Anything else (no bearer, the anon key, a foreign or invalid JWT): 401.
 */
import { bearerFrom, jwtRole } from "./edge-caller-auth.ts";
import { isServiceKey } from "./timing-safe-equal.ts";
import {
  type AdScope,
  type AdScopeStore,
  type AdToolAccess,
  type AdToolDenied,
  checkClientTarget,
  checkFbEntityTarget,
  checkGoogleTarget,
} from "./ad-tools-scope.ts";

export type { AdToolAccess, AdToolDenied } from "./ad-tools-scope.ts";
export type AdToolFunction = "carmen-fb-tools" | "carmen-google-tools";

export const AD_TOOL_APPROVER_ROLES: readonly string[] = [
  "owner",
  "agency_owner",
  "super_admin",
];

// Every action of both functions changes a campaign, ad or budget today. A
// read-only action is listed here when one is added; anything not listed
// (unknown actions included) needs an approver.
const READ_ONLY_ACTIONS: Record<AdToolFunction, ReadonlySet<string>> = {
  "carmen-fb-tools": new Set<string>(),
  "carmen-google-tools": new Set<string>(),
};

export function adToolAccess(fn: AdToolFunction, action: unknown) {
  const read = typeof action === "string" && READ_ONLY_ACTIONS[fn].has(action);
  return (read ? "read" : "write") as AdToolAccess;
}

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

const denied = (
  status: 400 | 401 | 403,
  error: string,
  message?: string,
): AdToolDenied => ({ ok: false, status, error, message });

export async function authorizeAdToolCaller(input: {
  authorization: string | null | undefined;
  serviceRoleKey: string;
  bodyTenantId: unknown;
  access: AdToolAccess;
  identity: AdToolIdentity;
}): Promise<AdToolAuthResult> {
  const token = bearerFrom(input.authorization);
  if (!token) return denied(401, "unauthorized");
  if (isServiceKey(token, input.serviceRoleKey.trim())) {
    const tenantId = input.bodyTenantId;
    if (typeof tenantId !== "string" || !tenantId.trim())
      return denied(400, "tenant_id and action required");
    return { ok: true, caller: { kind: "service_role", tenantId } };
  }
  // The public anon key, or a service-role JWT that is not this project's.
  const role = jwtRole(token);
  if (role === "anon" || role === "service_role")
    return denied(401, "unauthorized");

  const userId = await input.identity.getUserId(token);
  if (!userId) return denied(401, "unauthorized");

  const [isSuperAdmin, tenantId] = await Promise.all([
    input.identity.isSuperAdmin(userId),
    input.identity.activeTenantId(userId),
  ]);
  if (!tenantId)
    return denied(403, "no_active_tenant", "לא נמצא ארגון פעיל למשתמש.");
  const superAdmin =
    isSuperAdmin && (await input.identity.allowsSuperAdmin(tenantId));
  const roles = await input.identity.tenantRoles(userId, tenantId);
  if (!roles && !superAdmin)
    return denied(403, "not_tenant_member", "המשתמש לא משויך לארגון הפעיל.");

  const isApprover =
    superAdmin || (roles ?? []).some((r) => AD_TOOL_APPROVER_ROLES.includes(r));
  if (input.access === "write" && !isApprover)
    return denied(
      403,
      "approver_role_required",
      "רק בעלים, בעל סוכנות או סופר אדמין יכולים לשנות קמפיינים, מודעות ותקציבים.",
    );
  return { ok: true, caller: { kind: "user", userId, tenantId, isApprover } };
}

type GateInput = {
  authorization: string | null | undefined;
  serviceRoleKey: string;
  body: Record<string, unknown>;
  identity: AdToolIdentity;
  store: AdScopeStore;
};

const callerInput = (input: GateInput, access: AdToolAccess) => ({
  authorization: input.authorization,
  serviceRoleKey: input.serviceRoleKey,
  bodyTenantId: input.body.tenant_id,
  access,
  identity: input.identity,
});

/**
 * Whose Meta token a carmen-fb-tools call runs with: `clientId` set means the
 * token of the tenant that owns that client, else the tenant's own token.
 *
 * A user acts only with their own tenant's token, so Meta's grants on it bound
 * what they can reach. The client-owning tenant's token would let a share
 * holder act on that tenant's other ad accounts, linked through rows the user
 * can write themselves (clients.meta_ads_account_id, crm_tables). The service
 * role keeps the client-owning tenant's token for shared clients (approval
 * execute, the shutdown runner).
 */
export type FbTokenSource = { tenantId: string; clientId: string | null };

export function fbTokenSource(
  caller: AdToolCaller,
  bodyClientId: unknown,
): FbTokenSource {
  if (caller.kind === "user")
    return { tenantId: caller.tenantId, clientId: null };
  return {
    tenantId: caller.tenantId,
    clientId: bodyClientId ? String(bodyClientId) : null,
  };
}

/** carmen-fb-tools: caller, then (for a user) client_id and the Meta object. */
export async function authorizeFbToolRequest(
  input: GateInput & {
    /** Ad account of a Meta campaign / ad set / ad, read with that token;
     * null when the token cannot read it. */
    fetchAccountId(
      token: FbTokenSource,
      entityId: string,
    ): Promise<string | null>;
  },
): Promise<AdToolAuthResult> {
  const action = String(input.body.action ?? "");
  const access = adToolAccess("carmen-fb-tools", action);
  const auth = await authorizeAdToolCaller(callerInput(input, access));
  if (!auth.ok || auth.caller.kind !== "user") return auth;
  const caller = auth.caller;
  const scope: AdScope = { tenantId: caller.tenantId, access };
  const client = await checkClientTarget(
    input.store,
    scope,
    input.body.client_id,
  );
  if (!client.ok) return client;
  const entity = await checkFbEntityTarget({
    action,
    body: input.body,
    scope,
    store: input.store,
    fetchAccountId: (id) =>
      input.fetchAccountId(fbTokenSource(caller, input.body.client_id), id),
  });
  return entity.ok ? auth : entity;
}

/** carmen-google-tools: caller, then (for a user) the Google Ads customer. */
export async function authorizeGoogleToolRequest(
  input: GateInput,
): Promise<AdToolAuthResult> {
  const access = adToolAccess("carmen-google-tools", input.body.action);
  const auth = await authorizeAdToolCaller(callerInput(input, access));
  if (!auth.ok || auth.caller.kind !== "user") return auth;
  const scope: AdScope = { tenantId: auth.caller.tenantId, access };
  const target = await checkGoogleTarget({
    body: input.body,
    scope,
    store: input.store,
  });
  return target.ok ? auth : target;
}
