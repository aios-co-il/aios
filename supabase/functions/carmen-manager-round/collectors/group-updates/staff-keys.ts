/**
 * Who speaks for the agency in a client group: the phone match keys of the
 * people of the tenant and of the tenants it shares agencies with (logins
 * with a role, active campaigners, sales people) and of their Manus lines. A
 * group message from one of these phones is a staff message even though it
 * reached the monitored line as inbound. Kept in memory for labelling, and
 * for naming the staff member who reported a call or meeting (contact.ts).
 */
import type { Json } from "../../../_shared/database.types.ts";
import { jsonObject } from "../../../_shared/manager-round/json-object.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../../../_shared/telephony/phone.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";
import { profilePhone, profilesBy } from "../../recipients/profiles.ts";

/**
 * Each staff phone match key, with the AIOS person it belongs to when exactly
 * one login has it; null for a campaigner or sales record without a login, a
 * Manus line, or a phone two logins share.
 */
export type StaffKeys = ReadonlyMap<string, string | null>;

/** Phone match keys of the staff of the tenant and its agency partners. */
export async function loadStaffKeys(
  db: DbClient,
  tenantId: string,
): Promise<StaffKeys> {
  const tenantIds = await relatedTenants(db, tenantId);
  const [roles, members, campaigners, sales, lines] = await Promise.all([
    db.from("user_roles").select("user_id").in("tenant_id", tenantIds),
    db.from("tenant_users").select("user_id").in("tenant_id", tenantIds),
    db
      .from("campaigners")
      .select("phone")
      .in("tenant_id", tenantIds)
      .eq("active", true),
    db
      .from("sales_people")
      .select("phone")
      .in("tenant_id", tenantIds)
      .eq("active", true),
    db
      .from("tenant_integrations")
      .select("settings")
      .in("tenant_id", tenantIds)
      .eq("integration_type", "manus_wa"),
  ]);
  throwIf(roles.error, "user_roles");
  throwIf(members.error, "tenant_users");
  throwIf(campaigners.error, "campaigners");
  throwIf(sales.error, "sales_people");
  throwIf(lines.error, "tenant_integrations");
  const userIds = [
    ...new Set(
      [...(roles.data ?? []), ...(members.data ?? [])].map((r) => r.user_id),
    ),
  ];
  const logins = (await profilesBy(db, "id", userIds)).map((profile) => ({
    key: phoneMatchKey(profilePhone(profile)),
    userId: profile.id,
  }));
  return staffKeyMap(logins, [
    ...(campaigners.data ?? []).map((row) => row.phone),
    ...(sales.data ?? []).map((row) => row.phone),
    ...(lines.data ?? []).map((row) => linePhone(row.settings)),
  ]);
}

/** The logins' keys with their person (null when two share one), then the other phones' keys. */
function staffKeyMap(
  logins: { key: string | null; userId: string }[],
  otherPhones: (string | null)[],
): StaffKeys {
  const keys = new Map<string, string | null>();
  for (const { key, userId } of logins) {
    if (key) {
      const shared = keys.has(key) && keys.get(key) !== userId;
      keys.set(key, shared ? null : userId);
    }
  }
  for (const key of otherPhones.map(phoneMatchKey)) {
    if (key && !keys.has(key)) {
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

/** The number a Manus line sends from (settings.phone_number). */
function linePhone(settings: Json | null): string | null {
  const phone = jsonObject(settings)?.phone_number;
  return typeof phone === "string" || typeof phone === "number"
    ? String(phone)
    : null;
}
