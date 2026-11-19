// Who may use a Search Console connection for a client's SEO pages: the same
// rule the SEO screens use (src/hooks/useSeoScope.ts). The caller must be able
// to see the client with their own session (RLS), and a connection serves the
// client when it belongs to the client's organization or to one linked to the
// client's agency through agency_tenant_access.
import { z } from "npm:zod@3.25.76";
import { tenantUserAccess } from "../auth/tenant-access.ts";
import { serviceClient, userClient } from "../supabase-clients.ts";

/** Client and integration ids are uuids. */
const uuidSchema = z.string().uuid();

/** The signed-in caller and the organizations whose connections may serve the client. */
export type ClientGscAccess = { userId: string; tenantIds: Array<string> };

/** Why access is refused, with the status to answer. */
export type GscRefusal = { status: 400 | 401 | 403; error: string };

/** The caller's access to the client's Search Console connections, or why it is refused. */
export async function readClientGscAccess(
  authHeader: string | null,
  clientId: unknown,
): Promise<ClientGscAccess | GscRefusal> {
  if (!authHeader) {
    return { status: 401, error: "Missing authorization header" };
  }

  const caller = userClient(authHeader);
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();
  if (userError || !user) {
    return { status: 401, error: "Not signed in" };
  }

  const id = uuidSchema.safeParse(clientId);
  if (!id.success) {
    return { status: 400, error: "Missing or invalid clientId" };
  }

  // The caller's own session: RLS decides whether they may see this client.
  const { data: client, error: clientError } = await caller
    .from("clients")
    .select("id, tenant_id, agency_id")
    .eq("id", id.data)
    .maybeSingle();
  if (clientError) {
    throw accessCheckFailed("clients lookup", clientError.message);
  }
  if (!client?.tenant_id) {
    return { status: 403, error: "Client not found or access denied" };
  }

  return {
    userId: user.id,
    tenantIds: await clientGscTenantIds(client.tenant_id, client.agency_id),
  };
}

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

/** Whether access was refused. */
export function isGscRefusal(
  result: ClientGscAccess | GscRefusal,
): result is GscRefusal {
  return "status" in result;
}

/** The client's organization plus every organization linked to its agency. */
async function clientGscTenantIds(
  clientTenantId: string,
  agencyId: string | null,
): Promise<Array<string>> {
  const tenantIds = new Set([clientTenantId]);
  if (!agencyId) {
    return [...tenantIds];
  }

  const { data, error } = await serviceClient()
    .from("agency_tenant_access")
    .select("accessing_tenant_id, source_tenant_id")
    .eq("agency_id", agencyId);
  if (error) {
    throw accessCheckFailed("agency_tenant_access lookup", error.message);
  }

  for (const row of data) {
    tenantIds.add(row.accessing_tenant_id);
    tenantIds.add(row.source_tenant_id);
  }

  return [...tenantIds];
}

/**
 * An error for a failed access lookup. The database message goes to the log
 * only: the functions return error messages to the browser.
 */
function accessCheckFailed(step: string, detail: string): Error {
  console.error(`GSC access check: ${step} failed:`, detail);

  return new Error("Access check failed");
}
