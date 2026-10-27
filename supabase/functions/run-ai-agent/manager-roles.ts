/**
 * Roles run-ai-agent treats as managers: they skip the campaigner
 * narrow-scope, get the manager-only direct tools and may list every client's
 * reconciliation status. Every manager gate in this function reads this list,
 * so adding or removing a manager role is a change here only.
 */
export const MANAGER_ROLES: readonly string[] = [
  "owner",
  "agency_owner",
  "agency_manager",
  "super_admin",
];
