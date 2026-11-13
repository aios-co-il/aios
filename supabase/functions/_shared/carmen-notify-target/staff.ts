import type { NotifyStaffCandidate } from "./types.ts";

/** Recognize the staff roles given priority for private notifications. */
export function isManagerStaffRole(role: string | null | undefined): boolean {
  if (!role) {
    return false;
  }
  const r = String(role).toLowerCase();
  return (
    r.includes("manager") ||
    r.includes("מנהל") ||
    r === "owner" ||
    r === "admin" ||
    r === "agency_owner" ||
    r === "team_manager" ||
    r === "super_admin"
  );
}

/** Sort managers before other tenant staff. */
export function staffSortKey(s: NotifyStaffCandidate): number {
  return isManagerStaffRole(s.role) ? 0 : 1;
}
