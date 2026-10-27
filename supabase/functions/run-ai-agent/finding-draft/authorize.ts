/**
 * Who may log a finding's drafted contact through Carmen: the person the
 * finding belongs to, an owner-level manager, a team manager of its agency,
 * and, for a call nobody was named for, any campaigner assigned to the
 * client (the alert went to all of them). Everyone else is refused.
 */
import type { Json } from "../../_shared/database.types.ts";

export type ConfirmCaller = {
  /** The person talking to Carmen now (resolveHumanRequesterUserId). */
  userId: string;
  campaignerId: string | null;
  /** owner, agency_owner, agency_manager or super_admin (callerScope). */
  isManagerRole: boolean;
  isTeamManager: boolean;
  managedAgencyIds: string[];
};

export type ConfirmableFinding = {
  owner_user_id: string | null;
  agency_id: string | null;
  evidence: Json;
};

/** "yes", "if_assigned" (only as one of the client's campaigners) or "no". */
export function confirmRight(
  finding: ConfirmableFinding,
  caller: ConfirmCaller,
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
  return !isAttributed(finding.evidence) && caller.campaignerId
    ? "if_assigned"
    : "no";
}

/** evidence.attributed: the PBX named the caller. */
function isAttributed(evidence: Json): boolean {
  return (
    !!evidence &&
    typeof evidence === "object" &&
    !Array.isArray(evidence) &&
    evidence.attributed === true
  );
}
