/** Who may publish on behalf of a tenant (AIO-234).
 *
 * Publishing functions run with the service role, which bypasses RLS, so they
 * must check the caller themselves before acting on the rows they publish
 * (social_pages, social_media_posts, seo_geo_calendar_entries and their
 * marketing_work_items). A user must be a member of the row's tenant
 * (tenant_users) or a super admin, and when the row or the request names a
 * client, must also pass `user_can_access_client`. This is stricter than the
 * RLS of some of those tables: social_pages also admits the tenants a page is
 * shared with. The service role (internal callers such as run-ai-agent) is
 * always allowed.
 */

export type PublishCaller = {
  kind: "user" | "service";
  userId: string | null;
};

export type PublishDecision =
  { allowed: true } | { allowed: false; status: 401 | 403; error: string };

/** The membership facts the decision needs, looked up by the caller. */
export interface PublishAccessLookups {
  isTenantMember(userId: string, tenantId: string): Promise<boolean>;
  isSuperAdmin(userId: string): Promise<boolean>;
  canAccessClient(userId: string, clientId: string): Promise<boolean>;
}

/** Decide whether `caller` may publish for `tenantId`, and for every client
 * in `clientIds` (empty and repeated ids are ignored). */
export async function authorizeTenantPublisher(
  caller: PublishCaller | null,
  tenantId: string | null | undefined,
  clientIds: Array<string | null | undefined>,
  lookups: PublishAccessLookups,
): Promise<PublishDecision> {
  if (!caller) return { allowed: false, status: 401, error: "Unauthorized" };
  if (caller.kind === "service") return { allowed: true };
  const userId = caller.userId;
  if (!userId) return { allowed: false, status: 401, error: "Unauthorized" };
  if (!tenantId) return { allowed: false, status: 403, error: "Forbidden" };

  if (await lookups.isSuperAdmin(userId)) return { allowed: true };
  if (!(await lookups.isTenantMember(userId, tenantId)))
    return {
      allowed: false,
      status: 403,
      error: "Not a member of this tenant",
    };

  for (const clientId of new Set(clientIds.filter(Boolean) as string[])) {
    if (!(await lookups.canAccessClient(userId, clientId)))
      return {
        allowed: false,
        status: 403,
        error: "No access to this client",
      };
  }
  return { allowed: true };
}

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;

/** The service-role client surface the lookups use. `from` stays loose: a
 * structural query-builder type makes supabase-js type checking blow up. */
export type PublishAccessDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => QueryResult;
};

async function rpcBoolean(
  db: PublishAccessDb,
  fn: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data === true;
}

/** Lookups backed by a service-role client. Errors throw, so a failed lookup
 * never grants access. */
export function publishAccessLookups(
  db: PublishAccessDb,
): PublishAccessLookups {
  return {
    async isTenantMember(userId, tenantId) {
      const { data, error } = await db
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    isSuperAdmin: (userId) =>
      rpcBoolean(db, "is_super_admin", { _user_id: userId }),
    canAccessClient: (userId, clientId) =>
      rpcBoolean(db, "user_can_access_client", {
        _user_id: userId,
        _client_id: clientId,
      }),
  };
}

export type PublishTarget = {
  table: "seo_geo_calendar_entries" | "marketing_work_items";
  id: string;
};

export type PublishTargetDecision =
  | { allowed: true; tenantId: string }
  | { allowed: false; status: 401 | 403 | 404; error: string };

/** Decide whether `caller` may publish the row `target` names: the row's
 * tenant and its client, as authorizeTenantPublisher decides them. A missing
 * row is 404; a failed lookup throws rather than reading as missing. */
export async function authorizePublishTarget(
  caller: PublishCaller,
  db: PublishAccessDb,
  target: PublishTarget,
  lookups: PublishAccessLookups = publishAccessLookups(db),
): Promise<PublishTargetDecision> {
  const { data, error } = await db
    .from(target.table)
    .select("tenant_id, client_id")
    .eq("id", target.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const what =
      target.table === "marketing_work_items" ? "Work item" : "Entry";
    return { allowed: false, status: 404, error: `${what} not found` };
  }
  const decision = await authorizeTenantPublisher(
    caller,
    data.tenant_id,
    [data.client_id],
    lookups,
  );
  return decision.allowed
    ? { allowed: true, tenantId: data.tenant_id }
    : decision;
}

/** Why a WordPress site may not be used for a row of `tenantId`/`clientId`,
 * or null when it may. A site of another tenant is never allowed; a site tied
 * to a client must be that client's. */
export function wordPressSiteScopeError(
  site: { tenant_id: string; client_id: string | null },
  tenantId: string,
  clientId: string | null,
): string | null {
  if (site.tenant_id !== tenantId)
    return "WordPress site belongs to another tenant";
  if (site.client_id && site.client_id !== clientId)
    return "WordPress site belongs to another client";
  return null;
}
