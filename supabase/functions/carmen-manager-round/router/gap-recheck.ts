/**
 * Routing gaps raised earlier are checked again every round, so a gap that
 * was fixed (a campaigner assigned, a phone added) clears itself even when no
 * other finding brings its client or person back to the router.
 */
import { normalizeStaffPhone } from "../../_shared/staff-whatsapp.ts";
import type { FindingsStore } from "../findings/store.ts";
import {
  evidenceText,
  type FindingRow,
  type Recipient,
  type RecipientRole,
} from "../findings/types.ts";
import type { Contact } from "../recipients/contacts.ts";
import { ROUTER_KINDS } from "../recipients/data-findings.ts";
import type { PeopleDirectory, StaffMember } from "../recipients/directory.ts";

/** Live gaps re-checked per tenant per round. */
const GAP_RECHECK_LIMIT = 100;

const ROLES: readonly RecipientRole[] = ["campaigner", "manager", "owner"];

/** The tenant's live no_campaigner and missing_phone findings. */
export function listOpenGaps(
  findings: FindingsStore,
  tenantId: string,
): Promise<FindingRow[]> {
  return findings.listLive(tenantId, GAP_RECHECK_LIMIT, ROUTER_KINDS);
}

/** Clients of the open no_campaigner gaps. */
export function gapClientIds(gaps: FindingRow[]): string[] {
  return gaps.flatMap((gap) =>
    gap.kind === "no_campaigner" && gap.client_id ? [gap.client_id] : [],
  );
}

/**
 * The people of the open missing_phone gaps as they are now: staff from the
 * tenant's staff list, campaigners from the directory. `gone` lists keys of
 * people the router can no longer reach, whose gaps are cleared.
 */
export async function recheckPeople(
  directory: PeopleDirectory,
  tenantId: string,
  staff: StaffMember[],
  gaps: FindingRow[],
): Promise<{ people: Recipient[]; gone: string[] }> {
  const named = gaps.flatMap((gap) => {
    const key = evidenceText(gap.evidence, "recipient_key");
    return gap.kind === "missing_phone" && key
      ? [{ key, role: roleOf(evidenceText(gap.evidence, "role")) }]
      : [];
  });
  const members = new Map(staff.map((m) => [`user:${m.user_id}`, m]));
  const others = named.map(({ key }) => key).filter((k) => !members.has(k));
  const contacts = others.length
    ? await directory.contacts(tenantId, others)
    : new Map<string, Contact>();
  const people: Recipient[] = [];
  const gone: string[] = [];
  for (const { key, role } of named) {
    const contact = members.get(key) ?? contacts.get(key);
    if (!contact) {
      gone.push(key);
      continue;
    }
    people.push({
      key,
      user_id: key.startsWith("user:") ? key.slice("user:".length) : null,
      name: contact.name,
      phone: normalizeStaffPhone(contact.phone),
      role,
    });
  }
  return { people, gone };
}

/** The recorded role, or campaigner when it is not one. */
function roleOf(raw: string | null): RecipientRole {
  return ROLES.find((role) => role === raw) ?? "campaigner";
}
