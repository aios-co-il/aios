// The tenant a Manus file is sent for.
import type { DbClient } from "../_shared/supabase-clients.ts";
import type { FileSendRequest } from "./request.ts";

type TenantLookup = PromiseLike<{
  data: { tenant_id: string | null } | null;
  error: unknown;
}>;

/**
 * The tenant named in the call, else the client's or the lead's, else the
 * caller's active tenant. The caller's membership in it is checked next.
 */
export async function resolveTenantId(
  admin: DbClient,
  request: FileSendRequest,
  userId: string,
): Promise<string | null> {
  if (request.tenantId) {
    return request.tenantId;
  }
  return (
    (await recordTenantId(admin, request)) ??
    (await activeTenantId(admin, userId))
  );
}

/** The tenant of the client or lead the send is for, if it names one. */
async function recordTenantId(
  admin: DbClient,
  request: FileSendRequest,
): Promise<string | null> {
  if (request.clientId) {
    return tenantOf(
      admin
        .from("clients")
        .select("tenant_id")
        .eq("id", request.clientId)
        .maybeSingle(),
    );
  }
  if (request.leadId) {
    return tenantOf(
      admin
        .from("leads")
        .select("tenant_id")
        .eq("id", request.leadId)
        .maybeSingle(),
    );
  }
  return null;
}

/** The caller's active tenant. */
function activeTenantId(
  admin: DbClient,
  userId: string,
): Promise<string | null> {
  return tenantOf(
    admin
      .from("user_active_tenant")
      .select("tenant_id")
      .eq("user_id", userId)
      .maybeSingle(),
  );
}

/** The tenant_id a lookup found; a failed lookup throws. */
async function tenantOf(lookup: TenantLookup): Promise<string | null> {
  const { data, error } = await lookup;
  if (error) {
    throw error;
  }
  return data?.tenant_id ?? null;
}
