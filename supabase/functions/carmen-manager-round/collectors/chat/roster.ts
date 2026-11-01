/**
 * Who answers clients: the phone match keys of the staff of the given
 * tenants (logins with a role there, active campaigners and sales people)
 * and of the tenants' own lines (Carmen's Manus lines and the Green API
 * lines, line-numbers.ts). A group message from one of these phones is a
 * staff reply, even though it reached the monitored line as inbound. Built
 * in TypeScript on purpose: there is no SQL copy of the roster. Each phone
 * keeps its tenant and its login, so the group-update collector can name
 * the staff member of a client's own tenant (group-updates/authorship.ts).
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../../../_shared/telephony/phone.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { profilePhone, profilesBy } from "../../recipients/profiles.ts";
import { linePhones } from "./line-numbers.ts";

export type StaffRoster = {
  /**
   * Each staff phone match key, with the login it belongs to when exactly
   * one login has it; null for a campaigner or sales record without a login,
   * a line, or a phone two logins share.
   */
  keys: ReadonlyMap<string, string | null>;
  /** Each staff phone match key with the tenants whose staff has it. */
  keyTenants: ReadonlyMap<string, ReadonlySet<string>>;
  /** Each login's tenants among those read. */
  tenantsOf: ReadonlyMap<string, ReadonlySet<string>>;
};

/** One staff phone: its match key, its tenant and its login, if any. */
type StaffPhone = { key: string; tenantId: string; userId: string | null };

/** Phone match keys of everyone who speaks for the tenants. */
export async function loadStaffKeys(
  db: DbClient,
  tenantIds: string[],
  since: Date,
): Promise<Set<string>> {
  return new Set((await loadStaffRoster(db, tenantIds, since)).keys.keys());
}

/** Everyone who speaks for the tenants: each phone's key, tenant and login. */
export async function loadStaffRoster(
  db: DbClient,
  tenantIds: string[],
  since: Date,
): Promise<StaffRoster> {
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
    linePhones(db, tenantIds, since),
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
    ...lines.flatMap((line) => staffPhone(line.phone, line.tenantId, null)),
  ];
  return {
    keys: staffKeyMap(phones),
    keyTenants: keyTenants(phones),
    tenantsOf,
  };
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

/** The phone as a staff phone of the tenant, or nothing without a usable phone. */
function staffPhone(
  phone: string | null,
  tenantId: string | null,
  userId: string | null,
): StaffPhone[] {
  const key = phoneMatchKey(phone);
  return key && tenantId ? [{ key, tenantId, userId }] : [];
}

/** The logins' keys with their person (null when two share one), then the other phones' keys. */
function staffKeyMap(phones: StaffPhone[]): StaffRoster["keys"] {
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

/** Each key with the tenants whose staff has it. */
function keyTenants(phones: StaffPhone[]): StaffRoster["keyTenants"] {
  const tenants = new Map<string, Set<string>>();
  for (const { key, tenantId } of phones) {
    tenants.set(key, (tenants.get(key) ?? new Set<string>()).add(tenantId));
  }
  return tenants;
}
