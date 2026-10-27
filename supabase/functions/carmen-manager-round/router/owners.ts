/**
 * The first recipient of owner-first findings (KIND_POLICY.ownerFirst: an
 * unlogged call goes to the caller the PBX extension named). The owner is
 * looked up among the client's campaigners, then the tenant's staff, then
 * the tenant's active campaigner logins. Someone the router cannot reach in
 * this tenant is left out, so the ladder starts with the client's
 * campaigners instead.
 */
import { isFindingKind } from "../../_shared/manager-round/kinds.ts";
import { normalizeStaffPhone } from "../../_shared/staff-whatsapp.ts";
import type { FindingRow, Recipient } from "../findings/types.ts";
import type { PeopleDirectory, StaffMember } from "../recipients/directory.ts";
import {
  type ClientRecipients,
  staffRecipient,
} from "../recipients/resolve.ts";
import { KIND_POLICY } from "./policy.ts";

export type OwnerInput = {
  tenantId: string;
  findings: FindingRow[];
  /** Each client's people, as resolved for this run. */
  people: Map<string, ClientRecipients>;
  staff: StaffMember[];
};

/** The reachable owner of each owner-first finding, by finding id. */
export async function resolveOwners(
  directory: PeopleDirectory,
  input: OwnerInput,
): Promise<Map<string, Recipient>> {
  const owners = new Map<string, Recipient>();
  const unknown: { findingId: string; key: string; userId: string }[] = [];
  for (const finding of input.findings) {
    const userId = ownerFirstUser(finding);
    if (!userId) {
      continue;
    }
    const known = knownPerson(finding.client_id, userId, input);
    if (known) {
      owners.set(finding.id, known);
    } else {
      unknown.push({ findingId: finding.id, key: `user:${userId}`, userId });
    }
  }
  if (!unknown.length) {
    return owners;
  }
  const contacts = await directory.contacts(input.tenantId, [
    ...new Set(unknown.map((entry) => entry.key)),
  ]);
  for (const { findingId, key, userId } of unknown) {
    const contact = contacts.get(key);
    if (contact) {
      owners.set(findingId, {
        key,
        user_id: userId,
        name: contact.name,
        phone: normalizeStaffPhone(contact.phone),
        role: "campaigner",
      });
    }
  }
  return owners;
}

/** The owner of a finding whose kind goes to its owner first, else null. */
function ownerFirstUser(finding: FindingRow): string | null {
  return isFindingKind(finding.kind) && KIND_POLICY[finding.kind].ownerFirst
    ? finding.owner_user_id
    : null;
}

/** The owner as one of the client's campaigners or the tenant's staff. */
function knownPerson(
  clientId: string | null,
  userId: string,
  input: OwnerInput,
): Recipient | null {
  const campaigner = input.people
    .get(clientId ?? "")
    ?.campaigners.find((recipient) => recipient.user_id === userId);
  if (campaigner) {
    return campaigner;
  }
  const member = input.staff.find((staff) => staff.user_id === userId);
  return member ? staffRecipient(member, "manager") : null;
}
