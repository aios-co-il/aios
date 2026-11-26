// Who may sync a Search Console table: a member of the table's organization
// or a super admin. The connection must belong to that organization, or to
// another one the caller is a member of, super admins included.
import { tenantUserAccess } from "../_shared/auth/tenant-access.ts";
import { type DbClient, userClient } from "../_shared/supabase-clients.ts";

export type SyncRefusal = { status: number; error: string };

const DENIED: SyncRefusal = {
  status: 403,
  error: "Table or integration not found or access denied",
};

/** Why the caller may not sync the table with the connection, or null when they may. */
export async function refuseGscSync(
  db: DbClient,
  authHeader: string | null,
  tableTenantId: string,
  integrationTenantId: string,
): Promise<SyncRefusal | null> {
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

  const tableAccess = await tenantUserAccess(db, tableTenantId, user.id);
  if (!tableAccess.member && !tableAccess.superAdmin) {
    return DENIED;
  }
  if (integrationTenantId === tableTenantId) {
    return null;
  }

  const integrationAccess = await tenantUserAccess(
    db,
    integrationTenantId,
    user.id,
  );

  return integrationAccess.member ? null : DENIED;
}
