/**
 * Who speaks for the agency in a client group: the phone match keys of the
 * people of the tenant and of the tenants it shares agencies with (logins
 * with a role, active campaigners, sales people) and of their own lines
 * (Manus and Green API, chat/line-numbers.ts), each with its tenant. A
 * group message from one of these phones is a staff message even though it
 * reached the monitored line as inbound. Kept in memory for labelling, and
 * for naming the staff member who reported a call or meeting (contact.ts),
 * who must be a login of the client's own tenant.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../../../_shared/telephony/phone.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { profilePhone, profilesBy } from "../../recipients/profiles.ts";
import { linePhones } from "../chat/line-numbers.ts";

export type StaffKeys = {
  /**
   * Each staff phone match key, with the login it belongs to when exactly
   * one login has it; null for a campaigner or sales record without a login,
   * a Manus line, or a phone two logins share.
   */
  keys: ReadonlyMap<string, string | null>;
  /** Each staff phone match key with the tenants whose staff has that phone. */
  keyTenants: ReadonlyMap<string, ReadonlySet<string>>;
  /** Each login's tenants among the tenant and its agency partners. */
  tenantsOf: ReadonlyMap<string, ReadonlySet<string>>;
};

/** One staff phone: its match key, its tenant and its login, if any. */
type StaffPhone = { key: string; tenantId: string; userId: string | null };

/**
 * Phone match keys of the staff of the tenant and its agency partners; a
 * Green line's own number is the one its webhook rows report since `since`.
 */
export async function loadStaffKeys(
  db: DbClient,
  tenantId: string,
  since: Date,
): Promise<StaffKeys> {
  const tenantIds = await relatedTenants(db, tenantId);
  const [roles, members, campaigners, sales, lines] = await Promise.all([
    db
      .from("user_roles")
      .select("user_id, tenant_id")
      .in("tenant_id", tenantIds),
    db
      .from("tenant_users")
      .select("user_id, tenant_id")
      .in("tenant_id", tenantIds),
    db
      .from("campaigners")
      .select("phone, tenant_id")
      .in("tenant_id", tenantIds)
      .eq("active", true),
    db
      .from("sales_people")
      .select("phone, tenant_id")
      .in("tenant_id", tenantIds)
      .eq("active", true),
    Promise.all(tenantIds.map((tenant) => linePhones(db, [tenant], since))),
  ]);
  throwIf(roles.error, "user_roles");
  throwIf(members.error, "tenant_users");
  throwIf(campaigners.error, "campaigners");
  throwIf(sales.error, "sales_people");
  const tenantsOf = loginTenants([
    ...(roles.data ?? []),
    ...(members.data ?? []),
  ]);
  const profiles = await profilesBy(db, "id", [...tenantsOf.keys()]);
  const phones = [
    ...profiles.flatMap((profile) =>
      [...(tenantsOf.get(profile.id) ?? [])].flatMap((tenant) =>
        staffPhone(profilePhone(profile), tenant, profile.id),
      ),
    ),
    ...[...(campaigners.data ?? []), ...(sales.data ?? [])].flatMap((row) =>
      staffPhone(row.phone, row.tenant_id, null),
    ),
    ...tenantIds.flatMap((tenant, i) =>
      lines[i].flatMap((phone) => staffPhone(phone, tenant, null)),
    ),
  ];
  return {
    keys: staffKeyMap(phones),
    keyTenants: keyTenants(phones),
    tenantsOf,
  };
}

/** The phone as a staff phone of the tenant, or nothing without a usable phone. */
function staffPhone(
  phone: string | null,
  tenantId: string | null,
  userId: string | null,
): StaffPhone[] {
  const key = phoneMatchKey(phone);
  return key && tenantId ? [{ key, tenantId, userId }] : [];
}

/** Each key with the tenants whose staff has it. */
function keyTenants(phones: StaffPhone[]): StaffKeys["keyTenants"] {
  const tenants = new Map<string, Set<string>>();
  for (const { key, tenantId } of phones) {
    tenants.set(key, (tenants.get(key) ?? new Set<string>()).add(tenantId));
  }
  return tenants;
}

/** Each login with the tenants it has a role in. */
function loginTenants(
  rows: { user_id: string; tenant_id: string | null }[],
): Map<string, Set<string>> {
  const tenants = new Map<string, Set<string>>();
  for (const row of rows) {
    const known = tenants.get(row.user_id) ?? new Set<string>();
    if (row.tenant_id) {
      known.add(row.tenant_id);
    }
    tenants.set(row.user_id, known);
  }
  return tenants;
}

/** The logins' keys with their person (null when two share one), then the other phones' keys. */
function staffKeyMap(phones: StaffPhone[]): StaffKeys["keys"] {
  const keys = new Map<string, string | null>();
  for (const { key, userId } of phones) {
    if (userId) {
      const shared = keys.has(key) && keys.get(key) !== userId;
      keys.set(key, shared ? null : userId);
    }
  }
  for (const { key } of phones) {
    if (!keys.has(key)) {
      keys.set(key, null);
    }
  }
  return keys;
}

/** The tenant and the tenants it shares an agency with, either way. */
async function relatedTenants(
  db: DbClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("agency_tenant_access")
    .select("source_tenant_id, accessing_tenant_id")
    .or(`accessing_tenant_id.eq.${tenantId},source_tenant_id.eq.${tenantId}`);
  throwIf(error, "agency_tenant_access");
  const ids = (data ?? []).flatMap((row) => [
    row.source_tenant_id,
    row.accessing_tenant_id,
  ]);
  return [...new Set([tenantId, ...ids])];
}
