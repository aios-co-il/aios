/**
 * Who may approve a drafted card entry: the person the finding belongs to,
 * an owner-level manager, a team manager of its agency, and any campaigner
 * assigned to the client (the draft went to them). Everyone else is refused.
 */
export type ApproveCaller = {
  /** The person talking to Carmen now (resolveHumanRequesterUserId). */
  userId: string;
  campaignerId: string | null;
  /** owner, agency_owner, agency_manager or super_admin (callerScope). */
  isManagerRole: boolean;
  isTeamManager: boolean;
  managedAgencyIds: string[];
};

export type ApprovableFinding = {
  owner_user_id: string | null;
  agency_id: string | null;
};

/** "yes", "if_assigned" (only as one of the client's campaigners) or "no". */
export function approveRight(
  finding: ApprovableFinding,
  caller: ApproveCaller,
): "yes" | "if_assigned" | "no" {
  const managesAgency =
    caller.isTeamManager &&
    !!finding.agency_id &&
    caller.managedAgencyIds.includes(finding.agency_id);
  if (
    finding.owner_user_id === caller.userId ||
    caller.isManagerRole ||
    managesAgency
  ) {
    return "yes";
  }
  return caller.campaignerId ? "if_assigned" : "no";
}
