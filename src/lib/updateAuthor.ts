import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  departedMemberName,
  fetchDepartedMembers,
} from "@/lib/departedMembers";

/**
 * Author line of the update feeds (client card, lead card, pulse call dialog).
 *
 * profiles RLS shows a non-owner only their own row, so the feeds cannot read a
 * teammate's name through a profiles embed. `tenant_member_names` returns just
 * the id and display name of the tenant's members (profile name, else the
 * linked campaigner's name, which many campaigner logins rely on because
 * nothing fills `profiles.full_name` for them).
 */

export type MemberNames = ReadonlyMap<string, string>;

export const UNKNOWN_UPDATE_AUTHOR = "משתמש";

/**
 * Display names of the tenant's members, by user id; members without a name
 * are left out. Members who left (tenant_departed_members, AIO-321) keep
 * their name, marked "(לא פעיל)" or "(נמחק)".
 */
export async function fetchTenantMemberNames(
  db: Pick<SupabaseClient<Database>, "rpc">,
  tenantId: string,
): Promise<Map<string, string>> {
  const [{ data, error }, departed] = await Promise.all([
    db.rpc("tenant_member_names", { p_tenant_id: tenantId }),
    fetchDepartedMembers(db, [tenantId]),
  ]);
  if (error) {
    throw error;
  }
  const names = new Map<string, string>();
  for (const row of data ?? []) {
    const name = row.full_name?.trim();
    if (name) {
      names.set(row.user_id, name);
    }
  }
  for (const member of departed) {
    names.set(member.userId, departedMemberName(member));
  }
  return names;
}

/** Name to show for an update's writer: the member's name, then `fallback` (e.g. the caller's email), then a generic label. */
export function resolveUpdateAuthorName(
  names: MemberNames | undefined,
  userId: string | null | undefined,
  fallback?: string | null,
): string {
  const name = userId ? names?.get(userId) : undefined;
  return name ?? (fallback?.trim() || UNKNOWN_UPDATE_AUTHOR);
}
