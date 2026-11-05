/** Login profiles for routing, with the campaigner record each one links to. */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { throwIf } from "../../_shared/manager-round/db-error.ts";

/** Profiles (name, phone, campaigner link and that record) by id or campaigner id. */
export async function profilesBy(
  db: DbClient,
  column: "id" | "campaigner_id",
  values: string[],
) {
  if (!values.length) {
    return [];
  }
  const { data, error } = await db
    .from("profiles")
    .select(
      "id, full_name, phone, campaigner_id, campaigners(phone, tenant_id, active)",
    )
    .in(column, values);
  throwIf(error, "profiles");
  return data ?? [];
}

/**
 * A person's raw phone: the login profile's, else the linked campaigner
 * record's. Owner and manager alerts already read staff numbers through the
 * campaigner link (pulse-instant-alerts, campaign-pulse-snapshot).
 */
export function profilePhone(profile: {
  phone: string | null;
  campaigners: { phone: string | null } | null;
}): string | null {
  return profile.phone || profile.campaigners?.phone || null;
}
