/**
 * Who speaks for the agency in a client group: the phone match keys of the
 * people of the tenant and of the tenants it shares agencies with (logins
 * with a role, active campaigners, sales people) and of their Manus lines. A
 * group message from one of these phones is a staff message even though it
 * reached the monitored line as inbound. Kept in memory for labelling only.
 */
import type { Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../../../_shared/telephony/phone.ts";
import { throwIf } from "../../db-error.ts";
import { profilePhone, profilesBy } from "../../recipients/profiles.ts";

/** Phone match keys of the staff of the tenant and its agency partners. */
export async function loadStaffKeys(
  db: DbClient,
  tenantId: string,
): Promise<Set<string>> {
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
  const phones = [
    ...(await profilesBy(db, "id", userIds)).map(profilePhone),
    ...(campaigners.data ?? []).map((row) => row.phone),
    ...(sales.data ?? []).map((row) => row.phone),
    ...(lines.data ?? []).map((row) => linePhone(row.settings)),
  ];
  return new Set(phones.flatMap((phone) => phoneMatchKey(phone) ?? []));
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
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const phone = settings.phone_number;
  return typeof phone === "string" || typeof phone === "number"
    ? String(phone)
    : null;
}
