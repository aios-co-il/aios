/** The client card entry a confirmed draft becomes. */
import type { ClientCardEntryInput } from "../../_shared/client-card.ts";
import type { ContactDraftType } from "../../_shared/manager-round/contact-draft.ts";
import type { DraftFinding } from "./ports.ts";

export type ConfirmedEntry = {
  tenantId: string;
  finding: DraftFinding & { client_id: string };
  updateType: ContactDraftType;
  text: string;
  /** The person who confirmed; the entry is theirs and counts as their contact. */
  userId: string;
};

/**
 * A call or meeting Carmen writes at this person's request. source_ref is
 * the finding, so a repeated reply returns the first entry.
 */
export function cardEntry(entry: ConfirmedEntry): ClientCardEntryInput {
  return {
    tenantId: entry.tenantId,
    clientId: entry.finding.client_id,
    content: entry.text,
    updateType: entry.updateType,
    source: "carmen_confirmed",
    sourceRef: `finding:${entry.finding.id}`,
    attributedUserId: entry.userId,
    countsAsContact: true,
    metadata: {
      tool: "confirm_finding_draft",
      finding_id: entry.finding.id,
      short_code: entry.finding.short_code,
      finding_owner_user_id: entry.finding.owner_user_id,
      confirmed_by: entry.userId,
    },
  };
}
