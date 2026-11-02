/**
 * Service-role implementations of AdToolIdentity and AdScopeStore. Kept apart
 * from the decisions in ./caller.ts and ./scope.ts so those are tested
 * without a database.
 */
import type { DbClient } from "../supabase-clients.ts";
import type { AdToolIdentity } from "./caller.ts";
import { META_SETTING_KEYS, META_TABLE_TYPES } from "./meta-links.ts";
import type { AdScopeStore } from "./scope.ts";

/** The parts of the typed service-role client (serviceClient()) the identity
 * and store read with. Handlers still on supabase-js 2.45 pass serviceClient()
 * here, since a 2.45 client does not match these types. */
export type StoreDb = Pick<DbClient, "auth" | "rpc" | "from">;

/** Who the caller is, read with the service role. */
export function createAdToolIdentity(db: StoreDb): AdToolIdentity {
  return {
    async getUserId(token) {
      const { data, error } = await db.auth.getUser(token);
      return error ? null : (data?.user?.id ?? null);
    },
    async activeTenantId(userId) {
      const { data, error } = await db.rpc("get_user_tenant_id", {
        _user_id: userId,
      });
      if (error) {
        throw error;
      }
      return typeof data === "string" && data ? data : null;
    },
    async tenantRoles(userId, tenantId) {
      const [members, roles] = await Promise.all([
        db
          .from("tenant_users")
          .select("role")
          .eq("user_id", userId)
          .eq("tenant_id", tenantId),
        db
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("tenant_id", tenantId),
      ]);
      const memberRows = rowsOrThrow(members);
      const roleRows = rowsOrThrow(roles);
      if (!memberRows.length) {
        return null;
      }
      return [...memberRows, ...roleRows].map((r) => r.role).filter(Boolean);
    },
    async isSuperAdmin(userId) {
      const { data, error } = await db.rpc("is_super_admin", {
        _user_id: userId,
      });
      if (error) {
        throw error;
      }
      return data === true;
    },
    async allowsSuperAdmin(tenantId) {
      const res = await db
        .from("tenants")
        .select("allow_super_admin_access")
        .eq("id", tenantId);
      return rowsOrThrow(res)[0]?.allow_super_admin_access === true;
    },
  };
}

/** Which clients an ad account or customer links to, and which agencies are
 * shared with a tenant, read with the service role. */
export function createAdScopeStore(db: StoreDb): AdScopeStore {
  return {
    async clientsByIds(ids) {
      const res = await db
        .from("clients")
        .select("id, tenant_id, agency_id")
        .in("id", ids);
      return rowsOrThrow(res);
    },
    async clientIdsForMetaAccount(variants) {
      const [clients, tables] = await Promise.all([
        db.from("clients").select("id").in("meta_ads_account_id", variants),
        db
          .from("crm_tables")
          .select("client_id")
          .in("integration_type", META_TABLE_TYPES)
          .not("client_id", "is", null)
          .or(
            META_SETTING_KEYS.map(
              (k) => `integration_settings->>${k}.${inList(variants)}`,
            ).join(","),
          ),
      ]);
      return [
        ...clientIdsOf(rowsOrThrow(clients)),
        ...clientIdsOf(rowsOrThrow(tables)),
      ];
    },
    async clientIdsForGoogleCustomer(variants) {
      const [clients, tables] = await Promise.all([
        db.from("clients").select("id").in("google_ads_account_id", variants),
        db
          .from("crm_tables")
          .select("client_id")
          .eq("integration_type", "google_ads")
          .not("client_id", "is", null)
          .in("integration_settings->>customer_id", variants),
      ]);
      return [
        ...clientIdsOf(rowsOrThrow(clients)),
        ...clientIdsOf(rowsOrThrow(tables)),
      ];
    },
    async sharedAgencyIds(tenantId, access) {
      let q = db
        .from("agency_tenant_access")
        .select("agency_id")
        .eq("accessing_tenant_id", tenantId);
      if (access === "write") {
        q = q.eq("access_level", "read_write");
      }
      return rowsOrThrow(await q).map((r) => r.agency_id);
    },
  };
}

/** The rows, or the query's error thrown so a failed lookup is never read as
 * "no rows". */
function rowsOrThrow<T>(res: { data: T[] | null; error: unknown }): T[] {
  if (res.error) {
    throw res.error;
  }
  return res.data ?? [];
}

/** clients.id or crm_tables.client_id of each row. */
function clientIdsOf(
  rows: { id?: string | null; client_id?: string | null }[],
): string[] {
  return rows
    .map((r) => r.id ?? r.client_id)
    .filter((id): id is string => !!id);
}

/** Variants are digits, "act_<digits>" or "ddd-ddd-dddd", so they are safe
 * inside a PostgREST in.(...) list. */
function inList(variants: string[]): string {
  return `in.(${variants.join(",")})`;
}
