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
  const recordTenant = request.clientId
    ? await tenantOf(
        admin
          .from("clients")
          .select("tenant_id")
          .eq("id", request.clientId)
          .maybeSingle(),
      )
    : request.leadId
      ? await tenantOf(
          admin
            .from("leads")
            .select("tenant_id")
            .eq("id", request.leadId)
            .maybeSingle(),
        )
      : null;
  return (
    recordTenant ??
    tenantOf(
      admin
        .from("user_active_tenant")
        .select("tenant_id")
        .eq("user_id", userId)
        .maybeSingle(),
    )
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
