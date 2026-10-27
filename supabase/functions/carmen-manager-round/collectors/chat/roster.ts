/**
 * Who answers clients: the phone match keys of the staff of the given
 * tenants (logins with a role there, active campaigners and sales people)
 * and of Carmen's own Manus lines. A group message from one of these phones
 * is a staff reply, even though it reached the monitored line as inbound.
 * Built in TypeScript on purpose: there is no SQL copy of the roster.
 */
import type { Json } from "../../../_shared/database.types.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../../../_shared/telephony/phone.ts";
import { throwIf } from "../../db-error.ts";
import { profilePhone, profilesBy } from "../../recipients/profiles.ts";

/** Phone match keys of everyone who speaks for the tenants. */
export async function loadStaffKeys(
  db: DbClient,
  tenantIds: string[],
): Promise<Set<string>> {
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
      [...(roles.data ?? []), ...(members.data ?? [])].map(
        (row) => row.user_id,
      ),
    ),
  ];
  const profiles = await profilesBy(db, "id", userIds);
  const phones = [
    ...profiles.flatMap((profile) => [profile.phone, profilePhone(profile)]),
    ...(campaigners.data ?? []).map((row) => row.phone),
    ...(sales.data ?? []).map((row) => row.phone),
    ...(lines.data ?? []).map((row) => linePhone(row.settings)),
  ];
  return new Set(phones.flatMap((phone) => phoneMatchKey(phone) ?? []));
}

/** The number a Manus line sends from (settings.phone_number). */
function linePhone(settings: Json): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const phone = settings.phone_number;
  return typeof phone === "string" || typeof phone === "number"
    ? String(phone)
    : null;
}
