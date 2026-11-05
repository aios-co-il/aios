/**
 * Routing gaps as findings for the owner: clients without an active
 * campaigner and people without a usable phone, among those the router
 * resolved or re-checked this run; a gap checked again and found fixed (or
 * no longer reachable) is cleared at once.
 */
import type { FindingCandidate } from "../collectors/types.ts";
import { type DroppedCounts, reportDropped } from "../findings/dropped.ts";
import type { FindingsStore } from "../findings/store.ts";
import type { Recipient } from "../findings/types.ts";
import {
  missingPhoneFinding,
  noCampaignerFinding,
  ROUTER_COLLECTOR,
} from "../recipients/data-findings.ts";
import type { ClientRecipients } from "../recipients/resolve.ts";

export type Gaps = {
  candidates: FindingCandidate[];
  checkedClients: string[];
  checkedPeople: string[];
};

export type GapInput = {
  /** Each client resolved this run by id; a null client is no longer the tenant's. */
  clients: Map<string, ClientRecipients>;
  /** Brief recipients, owners of owner-first findings and the people of open missing_phone gaps. */
  people: Recipient[];
  /** Keys of people of open missing_phone gaps the router can no longer reach. */
  gone: string[];
};

/** Clients without a campaigner and people without a phone among those checked. */
export function routingGaps(input: GapInput, now: Date): Gaps {
  const candidates: FindingCandidate[] = [];
  const checkedClients: string[] = [];
  const everyone = new Map<string, Recipient>(
    input.people.map((recipient) => [recipient.key, recipient]),
  );
  for (const [clientId, { client, campaigners, managers }] of input.clients) {
    if (!clientId) {
      continue;
    }
    checkedClients.push(`client:${clientId}`);
    if (client && !campaigners.length) {
      candidates.push(noCampaignerFinding(client, now));
    }
    for (const recipient of [...campaigners, ...managers]) {
      everyone.set(recipient.key, recipient);
    }
  }
  for (const recipient of everyone.values()) {
    if (!recipient.phone) {
      candidates.push(missingPhoneFinding(recipient, now));
    }
  }
  return {
    candidates,
    checkedClients,
    checkedPeople: [...everyone.keys(), ...input.gone].map(
      (key) => `person:${key}`,
    ),
  };
}

/**
 * Upserts the gaps and clears those checked again and found fixed; returns
 * the gaps the database did not store (counted and logged).
 */
export async function recordGaps(
  findings: FindingsStore,
  input: { tenantId: string; roundId: string },
  gaps: Gaps,
): Promise<DroppedCounts> {
  const outcomes = await findings.upsert(
    input.tenantId,
    input.roundId,
    ROUTER_COLLECTOR,
    gaps.candidates,
  );
  const scopes: [string, string[]][] = [
    ["no_campaigner", gaps.checkedClients],
    ["missing_phone", gaps.checkedPeople],
  ];
  for (const [kind, checked] of scopes) {
    if (!checked.length) {
      continue;
    }
    const seen = gaps.candidates
      .filter((c) => c.kind === kind)
      .map((c) => c.fingerprint);
    await findings.markMissing(input.tenantId, input.roundId, {
      kind,
      seen,
      clientIds: null,
      fingerprints: checked,
      afterMisses: 1,
    });
  }
  return reportDropped(
    { tenantId: input.tenantId, collector: ROUTER_COLLECTOR.id },
    outcomes,
  );
}
