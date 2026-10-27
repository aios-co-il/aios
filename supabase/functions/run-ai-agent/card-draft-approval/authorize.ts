/**
 * Who may approve a drafted card entry, from the person's roles in the run's
 * tenant only (the rule of carmen_finding_viewer_role, the feed's RLS): an
 * owner or agency owner of the tenant, a team manager of the tenant who
 * manages the finding's agency, the finding's own person, and a member of
 * the tenant assigned to the client as campaigner (the draft went to them).
 * Roles held in other tenants never count, and a non-member may not approve.
 */

export type Approver = {
  /** The person talking to Carmen now (resolveHumanRequesterUserId). */
  userId: string;
  /** Their user_roles and tenant_users roles in the run's tenant. */
  roles: string[];
  /** user_managed_agencies of the person. */
  managedAgencyIds: string[];
  /** profiles.campaigner_id of the person. */
  campaignerId: string | null;
};

export type ApprovableFinding = {
  owner_user_id: string | null;
  agency_id: string | null;
};

const OWNER_ROLES: readonly string[] = ["owner", "agency_owner"];

/** "yes", "if_assigned" (only as one of the client's campaigners) or "no". */
export function approveRight(
  finding: ApprovableFinding,
  approver: Approver,
): "yes" | "if_assigned" | "no" {
  if (!approver.roles.length) {
    return "no";
  }
  const isOwner = approver.roles.some((role) => OWNER_ROLES.includes(role));
  const managesAgency =
    approver.roles.includes("team_manager") &&
    !!finding.agency_id &&
    approver.managedAgencyIds.includes(finding.agency_id);
  if (isOwner || managesAgency || finding.owner_user_id === approver.userId) {
    return "yes";
  }
  return approver.campaignerId ? "if_assigned" : "no";
}
