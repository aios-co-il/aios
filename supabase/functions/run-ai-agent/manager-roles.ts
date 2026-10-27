/**
 * Roles run-ai-agent treats as managers: they skip the campaigner
 * narrow-scope, get the manager-only direct tools and may list every client's
 * reconciliation status. The manager checks in run-ai-agent read this list,
 * but the role priority lists in index.ts still name these roles separately.
 * get_reconciliation_status and the direct-tool pool apply it to the caller's
 * roles in this tenant; executeTool and handleRunAgent still apply it to
 * callerRole, the caller's highest role in any tenant.
 */
export const MANAGER_ROLES: readonly string[] = [
  "owner",
  "agency_owner",
  "agency_manager",
  "super_admin",
];
