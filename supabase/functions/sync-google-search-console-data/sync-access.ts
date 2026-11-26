// Who may sync a Search Console table, and with which connection. Every read
// is scoped to the caller's organizations, so a table or a connection outside
// them is not found, whether or not it exists.
import { isSuperAdminUser } from "../_shared/auth/tenant-access.ts";
import { type DbClient, userClient } from "../_shared/supabase-clients.ts";
import { asUuidOrNull } from "../_shared/uuid.ts";

export type SyncRefusal = { status: number; error: string };

/** The one answer for a table or connection the caller may not use or that does not exist. */
export const SYNC_DENIED: SyncRefusal = {
  status: 403,
  error: "Table or integration not found or access denied",
};

/** The organizations the caller is a member of, and whether they are a super admin. */
export type SyncCaller = { tenantIds: Array<string>; superAdmin: boolean };

export function isSyncRefusal(
  value: SyncCaller | SyncRefusal,
): value is SyncRefusal {
  return "status" in value;
}

/** The signed-in caller's organizations, or why there is no caller. */
export async function readSyncCaller(
  db: DbClient,
  authHeader: string | null,
): Promise<SyncCaller | SyncRefusal> {
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

  const [memberships, superAdmin] = await Promise.all([
    db.from("tenant_users").select("tenant_id").eq("user_id", user.id),
    isSuperAdminUser(db, user.id),
  ]);
  if (memberships.error) {
    throw accessCheckFailed("tenant_users", memberships.error.message);
  }

  return {
    tenantIds: memberships.data.map((row) => row.tenant_id),
    superAdmin,
  };
}

/** The table, when the caller may sync it: one of their organizations', or any table for a super admin. */
export async function readSyncTable(
  db: DbClient,
  caller: SyncCaller,
  tableId: string,
) {
  const id = asUuidOrNull(tableId);
  if (!id) {
    return null;
  }

  const tables = db.from("crm_tables").select("*").eq("id", id);
  const { data, error } = await (
    caller.superAdmin ? tables : tables.in("tenant_id", caller.tenantIds)
  ).maybeSingle();
  if (error) {
    throw accessCheckFailed("crm_tables", error.message);
  }

  return data;
}

/**
 * The connection, when the table may be synced with it: one of the table's
 * organization, or of an organization the caller is a member of. This holds
 * for super admins too.
 */
export async function readSyncIntegration(
  db: DbClient,
  caller: SyncCaller,
  tableTenantId: string,
  integrationId: string,
) {
  const id = asUuidOrNull(integrationId);
  if (!id) {
    return null;
  }

  const { data, error } = await db
    .from("tenant_integrations")
    .select("*")
    .eq("id", id)
    .in("tenant_id", [tableTenantId, ...caller.tenantIds])
    .maybeSingle();
  if (error) {
    throw accessCheckFailed("tenant_integrations", error.message);
  }

  return data;
}

/** Logs the failed lookup and returns an error without the database's message. */
function accessCheckFailed(lookup: string, message: string): Error {
  console.error(
    `[sync-google-search-console-data] ${lookup} lookup failed:`,
    message,
  );

  return new Error("Access check failed");
}
