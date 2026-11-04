// How a person who wrote history is named once they left the organization.
// Shared by the app (src/lib/memberName.ts) and Carmen (no imports, so the
// app's type check can read this file). get_latest_client_call_updates uses
// the same DELETED_MEMBER_NAME in SQL.

/** A person who is no longer active in the organization (tenant_inactive_members.status). */
export type MemberStatus = "inactive" | "deleted";

/** The profile fields a history row shows for its writer. */
export type NamedProfile = {
  full_name?: string | null;
  email?: string | null;
};

/** Shown for a deleted person who had no name (their email is anonymized). */
export const DELETED_MEMBER_NAME = "משתמש שנמחק";

const STATUS_LABEL: Record<MemberStatus, string> = {
  deleted: "נמחק",
  inactive: "לא פעיל",
};

/** The status a tenant_inactive_members row reads as, or undefined for anything else. */
export function memberStatusOf(
  value: string | null | undefined,
): MemberStatus | undefined {
  return value === "inactive" || value === "deleted" ? value : undefined;
}

/**
 * The name history shows for a person: their name, else their email (never a
 * deleted person's: it is anonymized), else `fallback`, marked "(נמחק)" or
 * "(לא פעיל)" once they left the organization.
 */
export function formatMemberName(
  profile: NamedProfile | null | undefined,
  status?: MemberStatus,
  fallback = "משתמש",
): string {
  const email = status === "deleted" ? "" : profile?.email?.trim();
  const name = profile?.full_name?.trim() || email;
  if (!name && status === "deleted") {
    return DELETED_MEMBER_NAME;
  }
  const shown = name || fallback;
  return status ? `${shown} (${STATUS_LABEL[status]})` : shown;
}
