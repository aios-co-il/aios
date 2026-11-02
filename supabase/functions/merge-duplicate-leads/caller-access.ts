import type { requireAuth } from "../_shared/security.ts";

/** Who the request proved to be, as requireAuth reports it. */
export type MergeAuth = Awaited<ReturnType<typeof requireAuth>>;

/** The role lookups made as the caller; a `userClient(authHeader)` fits. */
export type CallerRoles = {
  rpc(
    fn: "get_user_tenant_id" | "is_super_admin",
    args: { _user_id: string },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  rpc(
    fn: "has_role",
    args: { _user_id: string; _role: "owner" },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** Go ahead with this tenant, or the HTTP status and error to return. */
export type MergeAccess =
  | { allowed: true; tenantId: string; dryRun: boolean }
  | { allowed: false; status: 400 | 401 | 403; error: string };

const DENIED: MergeAccess = {
  allowed: false,
  status: 403,
  error: "Only the tenant's owner can merge its duplicate leads",
};

/**
 * Whether this caller may merge (and delete) the tenant's duplicate leads:
 * a signed-in owner or super admin acting in that tenant (get_user_tenant_id),
 * the rule RLS applies to writes. A super admin writes only in the tenant
 * they act in. A caller with no user gets 401 before the body is read; the
 * role lookups run with the caller's own JWT.
 */
export async function authorizeMergeRequest(
  auth: MergeAuth,
  req: Request,
  asCaller: () => CallerRoles,
): Promise<MergeAccess> {
  if (auth?.kind !== "user" || !auth.userId) {
    return { allowed: false, status: 401, error: "Unauthorized" };
  }
  const body = await jsonObjectBody(req);
  if (!body) {
    return {
      allowed: false,
      status: 400,
      error: "Request body must be a JSON object",
    };
  }
  const tenantId = body.tenant_id;
  if (typeof tenantId !== "string" || !tenantId) {
    return { allowed: false, status: 400, error: "tenant_id is required" };
  }
  const caller = asCaller();
  const user = { _user_id: auth.userId };
  const acting = await caller.rpc("get_user_tenant_id", user);
  if (acting.error) {
    throw new Error(`Acting tenant lookup failed: ${acting.error.message}`);
  }
  if (acting.data !== tenantId) {
    return DENIED;
  }
  const [owner, superAdmin] = await Promise.all([
    caller.rpc("has_role", { ...user, _role: "owner" }),
    caller.rpc("is_super_admin", user),
  ]);
  const failed = owner.error ?? superAdmin.error;
  if (failed) {
    throw new Error(`Role lookup failed: ${failed.message}`);
  }
  if (owner.data !== true && superAdmin.data !== true) {
    return DENIED;
  }
  // Omitted dry_run means a dry run, as before; any falsy value runs it.
  const dryRun = body.dry_run === undefined ? true : Boolean(body.dry_run);
  return { allowed: true, tenantId, dryRun };
}

/** The request's JSON body when it is an object; null for anything else. */
async function jsonObjectBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  const body: unknown = await req.json().catch((error: unknown) => {
    console.warn("merge-duplicate-leads: body is not JSON:", error);
    return null;
  });
  return isRecord(body) ? body : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
