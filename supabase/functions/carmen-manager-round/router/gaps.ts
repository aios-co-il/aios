/**
 * Routing gaps as findings for the owner: clients without an active
 * campaigner and people without a usable phone among those the router
 * resolved this run; a gap checked again and found fixed is cleared at once.
 */
import type { FindingCandidate } from "../collectors/types.ts";
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

/** Clients without a campaigner and people without a phone among those resolved. */
export function routingGaps(
  people: ClientRecipients[],
  brief: Recipient[],
  now: Date,
): Gaps {
  const candidates: FindingCandidate[] = [];
  const checkedClients: string[] = [];
  const everyone = new Map<string, Recipient>(
    brief.map((recipient) => [recipient.key, recipient]),
  );
  for (const { client, campaigners, managers } of people) {
    if (!client) {
      continue;
    }
    checkedClients.push(`client:${client.id}`);
    if (!campaigners.length) {
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
    checkedPeople: [...everyone.keys()].map((key) => `person:${key}`),
  };
}

/** Upserts the gaps and clears those checked again and found fixed. */
export async function recordGaps(
  findings: FindingsStore,
  input: { tenantId: string; roundId: string },
  gaps: Gaps,
): Promise<void> {
  await findings.upsert(
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
}
