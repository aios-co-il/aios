// Who may use a Search Console connection for a client's SEO pages: the same
// rule the SEO screens use (src/hooks/useSeoScope.ts). The caller must be able
// to see the client with their own session (RLS), and a connection serves the
// client when it belongs to the client's organization or to one linked to the
// client's agency through agency_tenant_access.
import { z } from "npm:zod@3.25.76";
import { serviceClient, userClient } from "../supabase-clients.ts";

/** Client and integration ids are uuids. */
export const uuidSchema = z.string().uuid();

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
  if (!client) {
    return { status: 403, error: "Client not found or access denied" };
  }

  // An agency client may have no organization of its own; its agency's still count.
  const tenantIds = await clientGscTenantIds(
    client.tenant_id,
    client.agency_id,
  );
  if (tenantIds.length === 0) {
    return { status: 403, error: "Client not found or access denied" };
  }

  return { userId: user.id, tenantIds };
}

/** Whether access was refused. */
export function isGscRefusal(
  result: ClientGscAccess | GscRefusal,
): result is GscRefusal {
  return "status" in result;
}

/** The client's organization, when it has one, plus every organization linked to its agency. */
async function clientGscTenantIds(
  clientTenantId: string | null,
  agencyId: string | null,
): Promise<Array<string>> {
  const tenantIds = new Set<string>();
  if (clientTenantId) {
    tenantIds.add(clientTenantId);
  }
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
export function accessCheckFailed(step: string, detail: string): Error {
  console.error(`GSC access check: ${step} failed:`, detail);

  return new Error("Access check failed");
}
