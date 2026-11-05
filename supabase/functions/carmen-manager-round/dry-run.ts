/**
 * Dry run (dry_run or fixtures): collector candidates shown as new findings,
 * and the exact texts the round would send for the planned deliveries.
 */
import type { FindingCandidate } from "./collectors/types.ts";
import { composeAlertMessage } from "./dispatch/message.ts";
import type { FindingRow, RouteDecision } from "./findings/types.ts";

export type PreviewMessage = {
  to: string;
  has_phone: boolean;
  not_before: string;
  text: string;
};

/** Candidates as unrouted findings (short code 0: not stored). */
export function virtualFindings(candidates: FindingCandidate[]): FindingRow[] {
  return candidates.map((candidate, index) => ({
    id: `dry-run:${index}`,
    client_id: candidate.client_id,
    agency_id: candidate.agency_id,
    kind: candidate.kind,
    severity: candidate.severity,
    short_code: 0,
    status: "open",
    owner_user_id: candidate.owner_user_id,
    escalation_level: null,
    ladder_started_at: null,
    next_action_at: null,
    source_event_at: candidate.source_event_at,
    summary_he: candidate.summary_he,
    evidence: candidate.evidence,
  }));
}

/** One message per recipient over every planned delivery, whatever its time. */
export function previewMessages(
  decisions: RouteDecision[],
  findings: FindingRow[],
): PreviewMessage[] {
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const groups = new Map<
    string,
    { to: string; has_phone: boolean; not_before: string; items: FindingRow[] }
  >();
  for (const decision of decisions) {
    const finding = byId.get(decision.finding_id);
    for (const delivery of decision.deliveries) {
      const group = groups.get(delivery.recipient_key) ?? {
        to: delivery.recipient_name,
        has_phone: delivery.status === "planned",
        not_before: delivery.not_before,
        items: [],
      };
      if (finding && !group.items.includes(finding)) {
        group.items.push(finding);
      }
      groups.set(delivery.recipient_key, group);
    }
  }
  return [...groups.values()].map(({ items, ...group }) => ({
    ...group,
    text: composeAlertMessage(
      group.to,
      items.map((item) => ({
        short_code: item.short_code,
        summary_he: item.summary_he,
        escalated: false,
        critical: item.severity === "critical",
      })),
    ),
  }));
}
