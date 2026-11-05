/**
 * Caller roles from highest to lowest. run-ai-agent gives a caller the first
 * role they hold; every role here is AIOS staff.
 */
export const CALLER_ROLE_PRIORITY: readonly string[] = [
  "super_admin",
  "owner",
  "agency_owner",
  "agency_manager",
  "team_manager",
  "campaigner",
  "sales_person",
  "seo",
  "viewer",
];
