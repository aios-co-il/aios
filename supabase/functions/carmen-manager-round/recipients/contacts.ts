/**
 * Current contact details of campaigners a routing gap names, reached the
 * way the router reaches them: the login (user:<id>) of an active campaigner
 * of the tenant, or an active campaigner record (campaigner:<id>).
 */
import type { DbClient } from "../../_shared/supabase-clients.ts";
import { throwIf } from "../../_shared/manager-round/db-error.ts";
import { profilePhone, profilesBy } from "./profiles.ts";

export type Contact = { name: string; phone: string | null };

/** Contacts by recipient key; people no longer reachable are left out. */
export async function loadContacts(
  db: DbClient,
  tenantId: string,
  keys: string[],
): Promise<Map<string, Contact>> {
  const [profiles, records] = await Promise.all([
    profilesBy(db, "id", idsOf(keys, "user:")),
    campaignerRecords(db, tenantId, idsOf(keys, "campaigner:")),
  ]);
  const contacts = new Map<string, Contact>();
  for (const profile of profiles) {
    const linked = profile.campaigners;
    if (linked?.tenant_id === tenantId && linked.active) {
      contacts.set(`user:${profile.id}`, {
        name: profile.full_name || "",
        phone: profilePhone(profile),
      });
    }
  }
  for (const record of records) {
    contacts.set(`campaigner:${record.id}`, {
      name: record.full_name,
      phone: record.phone,
    });
  }
  return contacts;
}

/** The tenant's active campaigner records among `ids`. */
async function campaignerRecords(
  db: DbClient,
  tenantId: string,
  ids: string[],
) {
  if (!ids.length) {
    return [];
  }
  const { data, error } = await db
    .from("campaigners")
    .select("id, full_name, phone")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .in("id", ids);
  throwIf(error, "campaigners");
  return data ?? [];
}

/** The ids of the keys with `prefix`. */
function idsOf(keys: string[], prefix: string): string[] {
  return keys
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}
