import type { Tables } from "@/integrations/supabase/types";

/** A person who is no longer active in the organization (tenant_inactive_members.status). */
export type MemberStatus = "inactive" | "deleted";

/** The profile fields a history row shows for its writer. */
export type NamedProfile = Pick<Tables<"profiles">, "full_name" | "email">;

const STATUS_LABEL: Record<MemberStatus, string> = {
  deleted: "נמחק",
  inactive: "לא פעיל",
};

/** The status a tenant_inactive_members row reads as, or undefined for an unknown value. */
export function memberStatusOf(value: string): MemberStatus | undefined {
  return value === "inactive" || value === "deleted" ? value : undefined;
}

/**
 * The name history shows for a person: their name, else their email (a
 * deleted person's email is anonymized, so never theirs), else `fallback`,
 * marked "(נמחק)" or "(לא פעיל)" when they left the organization.
 */
export function formatMemberName(
  profile: Partial<NamedProfile> | null | undefined,
  status?: MemberStatus,
  fallback = "משתמש",
): string {
  const email = status === "deleted" ? "" : profile?.email?.trim();
  const name = profile?.full_name?.trim() || email || fallback;
  return status ? `${name} (${STATUS_LABEL[status]})` : name;
}
