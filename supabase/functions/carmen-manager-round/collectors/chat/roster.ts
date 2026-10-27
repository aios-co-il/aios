/**
 * Who answers clients: the phone match keys of the staff of the given
 * tenants (logins with a role there, active campaigners and sales people)
 * and of the tenants' own lines (Carmen's Manus lines and the Green API
 * lines, line-numbers.ts). A group message from one of these phones is a
 * staff reply, even though it reached the monitored line as inbound. Built
 * in TypeScript on purpose: there is no SQL copy of the roster.
 */
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { phoneMatchKey } from "../../../_shared/telephony/phone.ts";
import { throwIf } from "../../db-error.ts";
import { profilePhone, profilesBy } from "../../recipients/profiles.ts";
import { linePhones } from "./line-numbers.ts";

/** Phone match keys of everyone who speaks for the tenants. */
export async function loadStaffKeys(
  db: DbClient,
  tenantIds: string[],
  since: Date,
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
    linePhones(db, tenantIds, since),
  ]);
  throwIf(roles.error, "user_roles");
  throwIf(members.error, "tenant_users");
  throwIf(campaigners.error, "campaigners");
  throwIf(sales.error, "sales_people");
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
    ...lines,
  ];
  return new Set(phones.flatMap((phone) => phoneMatchKey(phone) ?? []));
}
