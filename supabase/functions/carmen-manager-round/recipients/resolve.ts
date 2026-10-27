/**
 * Who is responsible for a client: its active campaigners (campaign role
 * first), its managers (team managers and agency owners who manage the
 * client's agency); above them the brief recipients (default: the tenant
 * owners). Phones are normalised the way sendStaffAlert normalises them, so a
 * recipient without a phone here is exactly one the send would refuse.
 */
import type { ManagerSettings } from "../../_shared/manager-round/settings.ts";
import { normalizeStaffPhone } from "../../_shared/staff-whatsapp.ts";
import {
  type Recipient,
  type RecipientRole,
  uniqueByKey,
} from "../findings/types.ts";
import type {
  CampaignerAssignment,
  ClientInfo,
  PeopleDirectory,
  StaffMember,
} from "./directory.ts";

export type ClientRecipients = {
  client: ClientInfo | null;
  campaigners: Recipient[];
  managers: Recipient[];
};

/** The client's campaigners and managers in the routing tenant (none when it is not reachable). */
export async function resolveClientRecipients(
  directory: PeopleDirectory,
  input: {
    tenantId: string;
    clientId: string | null;
    today: string;
    staff: StaffMember[];
  },
): Promise<ClientRecipients> {
  const client = input.clientId
    ? await directory.client(input.tenantId, input.clientId)
    : null;
  if (!client) {
    return { client: null, campaigners: [], managers: [] };
  }
  const assignments = (
    await directory.campaigners(input.tenantId, client.id)
  ).filter((assignment) => isActiveOn(assignment, input.today));
  const managing = input.staff.filter((member) =>
    member.managed_agency_ids.includes(client.agency_id),
  );
  return {
    client,
    campaigners: uniqueByKey(
      sortCampaignRoleFirst(assignments).map(campaignerRecipient),
    ),
    managers: staffWith(managing, ["team_manager", "agency_owner"], "manager"),
  };
}

/**
 * The morning brief's recipients: the chosen staff (owners, agency owners or
 * team managers of the tenant), else the tenant owners, else its agency
 * owners. A choice that matches no staff member falls back the same way, so
 * david_only always has someone to reach when the tenant has an owner.
 */
export function resolveBriefRecipients(
  staff: StaffMember[],
  settings: Pick<ManagerSettings, "brief_recipients">,
): Recipient[] {
  const chosen = staff.filter((member) =>
    settings.brief_recipients.includes(member.user_id),
  );
  if (chosen.length) {
    return chosen.map((member) => staffRecipient(member, "owner"));
  }
  const owners = staffWith(staff, ["owner"], "owner");
  return owners.length ? owners : staffWith(staff, ["agency_owner"], "owner");
}

/** Staff holding one of `roles`, as recipients of `as`. */
function staffWith(
  staff: StaffMember[],
  roles: string[],
  as: RecipientRole,
): Recipient[] {
  const matching = staff.filter((member) =>
    member.roles.some((role) => roles.includes(role)),
  );
  return uniqueByKey(matching.map((member) => staffRecipient(member, as)));
}

/** A staff member as a recipient with a normalised phone. */
function staffRecipient(member: StaffMember, role: RecipientRole): Recipient {
  return {
    key: `user:${member.user_id}`,
    user_id: member.user_id,
    name: member.name,
    phone: normalizeStaffPhone(member.phone),
    role,
  };
}

/** A campaigner as a recipient, keyed by login when there is one. */
function campaignerRecipient(assignment: CampaignerAssignment): Recipient {
  return {
    key: assignment.user_id
      ? `user:${assignment.user_id}`
      : `campaigner:${assignment.campaigner_id}`,
    user_id: assignment.user_id,
    name: assignment.name,
    phone: normalizeStaffPhone(assignment.phone),
    role: "campaigner",
  };
}

/** Assigned on `today` (Israel date): started and not yet ended. */
function isActiveOn(assignment: CampaignerAssignment, today: string): boolean {
  return (
    (!assignment.start_date || assignment.start_date <= today) &&
    (!assignment.end_date || assignment.end_date >= today)
  );
}

/** Campaign-role assignments first, otherwise in their stored order. */
function sortCampaignRoleFirst(
  assignments: CampaignerAssignment[],
): CampaignerAssignment[] {
  return [...assignments].sort(
    (a, b) => Number(b.campaign_role) - Number(a.campaign_role),
  );
}
