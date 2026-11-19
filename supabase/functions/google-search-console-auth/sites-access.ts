// Who may list a Search Console connection's sites (get_sites): a member of
// its organization or a super admin, someone it is shared with, or someone who
// sees a client it serves (_shared/seo/client-gsc-access.ts).
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import {
  accessCheckFailed,
  type GscRefusal,
  isGscRefusal,
  readClientGscAccess,
  uuidSchema,
} from "../_shared/seo/client-gsc-access.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";

/**
 * Why the caller may not list a Search Console connection's sites, or null
 * when they may: a member of its organization or a super admin, someone it is
 * shared with (user_has_integration_permission), or someone who sees a client
 * it serves.
 */
export async function refuseGscSitesAccess(
  authHeader: string | null,
  integrationId: unknown,
  clientId: unknown,
): Promise<GscRefusal | null> {
  if (!authHeader) {
    return { status: 401, error: "Missing authorization header" };
  }

  const {
    data: { user },
    error: userError,
  } = await userClient(authHeader).auth.getUser();
  if (userError || !user) {
    return { status: 401, error: "Not signed in" };
  }

  const id = uuidSchema.safeParse(integrationId);
  if (!id.success) {
    return { status: 400, error: "Missing or invalid integrationId" };
  }

  const sb = serviceClient();
  const { data: integration, error } = await sb
    .from("tenant_integrations")
    .select("id, tenant_id")
    .eq("id", id.data)
    .eq("integration_type", "google_search_console")
    .maybeSingle();
  if (error) {
    throw accessCheckFailed("tenant_integrations lookup", error.message);
  }
  if (!integration) {
    return { status: 403, error: "Integration not found or access denied" };
  }

  const access = await tenantUserAccess(sb, integration.tenant_id, user.id);
  if (access.member || access.superAdmin) {
    return null;
  }

  const { data: shared, error: sharedError } = await sb.rpc(
    "user_has_integration_permission",
    { p_user_id: user.id, p_integration_id: integration.id },
  );
  if (sharedError) {
    throw accessCheckFailed(
      "user_has_integration_permission",
      sharedError.message,
    );
  }
  if (shared) {
    return null;
  }

  if (clientId !== undefined) {
    const clientAccess = await readClientGscAccess(authHeader, clientId);
    if (
      !isGscRefusal(clientAccess) &&
      clientAccess.tenantIds.includes(integration.tenant_id)
    ) {
      return null;
    }
  }

  return { status: 403, error: "Integration not found or access denied" };
}
