/**
 * Service-role implementations of AdToolIdentity and AdScopeStore. Kept apart
 * from the decisions in ./ad-tools-auth.ts and ./ad-tools-scope.ts so those
 * are tested without a database.
 */
import type { AdToolIdentity } from "./ad-tools-auth.ts";
import type {
  AdScopeStore,
  AdToolAccess,
  ScopeClient,
} from "./ad-tools-scope.ts";

type Rows<T> = { data: T[] | null; error: unknown };

// Settings keys carmen-fb-tools reads an ad account from (getClientAdAccount).
const META_SETTING_KEYS = ["ad_account_id", "account_id", "meta_account_id"];
const META_TABLE_TYPES = ["facebook_insights", "facebook_ecommerce"];

function rowsOrThrow<T>(res: Rows<T>): T[] {
  if (res.error) throw res.error;
  return res.data ?? [];
}

function clientIdsOf(rows: { id?: unknown; client_id?: unknown }[]) {
  return rows
    .map((r) => r.id ?? r.client_id)
    .filter((id): id is string => typeof id === "string" && !!id);
}

// deno-lint-ignore no-explicit-any
type Db = any;

/** Variants are digits, "act_<digits>" or "ddd-ddd-dddd", so they are safe
 * inside a PostgREST in.(...) list. */
const inList = (variants: string[]) => `in.(${variants.join(",")})`;

export function createAdToolIdentity(db: Db): AdToolIdentity {
  return {
    async getUserId(token) {
      const { data, error } = await db.auth.getUser(token);
      return error ? null : (data?.user?.id ?? null);
    },
    async activeTenantId(userId) {
      const { data, error } = await db.rpc("get_user_tenant_id", {
        _user_id: userId,
      });
      if (error) throw error;
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
      const memberRows = rowsOrThrow<{ role: unknown }>(members);
      const roleRows = rowsOrThrow<{ role: unknown }>(roles);
      if (!memberRows.length) return null;
      return [...memberRows, ...roleRows]
        .map((r) => (r.role == null ? "" : String(r.role)))
        .filter(Boolean);
    },
    async isSuperAdmin(userId) {
      const { data, error } = await db.rpc("is_super_admin", {
        _user_id: userId,
      });
      if (error) throw error;
      return data === true;
    },
  };
}

export function createAdScopeStore(db: Db): AdScopeStore {
  return {
    async clientsByIds(ids) {
      const res = await db
        .from("clients")
        .select("id, tenant_id, agency_id")
        .in("id", ids);
      return rowsOrThrow<ScopeClient>(res);
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
    async sharedAgencyIds(tenantId, access: AdToolAccess) {
      let q = db
        .from("agency_tenant_access")
        .select("agency_id")
        .eq("accessing_tenant_id", tenantId);
      if (access === "write") q = q.eq("access_level", "read_write");
      const rows = rowsOrThrow<{ agency_id: unknown }>(await q);
      return rows
        .map((r) => r.agency_id)
        .filter((id): id is string => typeof id === "string" && !!id);
    },
  };
}
