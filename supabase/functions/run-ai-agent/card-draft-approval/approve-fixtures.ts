/** Fakes for approve_card_draft's tests: one live finding, its draft and the run's reply. */
import {
  ClientCardEntryError,
  type ClientCardEntryInput,
} from "../../_shared/client-card/entry-types.ts";
import { findingDraftReplyOf } from "../finding-draft/reply.ts";
import type { ApproveInput } from "./approve.ts";
import type { ApprovalPorts, DraftFinding } from "./ports.ts";

export const draft = {
  source: "group_digest",
  update_type: "group_summary",
  source_ref: "g1:m9",
  content: "[כרמן · סיכום קבוצה] אישר תקציב ₪5,000",
};
export const live: DraftFinding = {
  id: "f1",
  client_id: "c1",
  agency_id: "a1",
  short_code: 31,
  evidence: { card_draft: draft },
};

/** The same finding when the group also reported a held call. */
export const withCall: DraftFinding = {
  ...live,
  evidence: {
    card_draft: {
      ...draft,
      contact: {
        update_type: "call",
        source_ref: "group_contact:g1:m2",
        content: "[כרמן · מקבוצת הוואטסאפ] שיחת טלפון עם הלקוח",
        participant_user_id: null,
        reported_at: "2026-11-01T10:00:00Z",
      },
    },
  },
};

/** Each person's role for the finding in t1, as carmen_finding_role_of answers. */
export const ROLES: Record<string, string> = {
  dana: "campaigner",
  boss: "owner",
};

/**
 * Fake ports over one live finding: `roles` stands for the database's rule
 * (anyone missing has no role), and `refuse` makes the card write fail.
 */
export function ports(
  finding: DraftFinding | null,
  roles: Record<string, string> = ROLES,
  refuse = false,
) {
  const written: ClientCardEntryInput[] = [];
  const closed: (string | null)[] = [];
  const looked: number[] = [];
  const asked: unknown[][] = [];
  const fake: ApprovalPorts = {
    findLive: (_tenant, code) => {
      looked.push(code);
      return Promise.resolve(
        finding && code === finding.short_code ? finding : null,
      );
    },
    roleOf: (tenant, scope, userId) => {
      asked.push([tenant, scope.client_id, scope.agency_id, userId]);
      return Promise.resolve(roles[userId] ?? null);
    },
    write: {
      writeEntry(input) {
        if (refuse) {
          return Promise.reject(
            new ClientCardEntryError("access_denied", "אין גישה ללקוח"),
          );
        }
        written.push(input);
        return Promise.resolve({
          entryId: "e1",
          inserted: true,
          userId: "dana",
          attribution: "campaigner",
        });
      },
      resolveWritten(_tenant, _finding, _entry, actor) {
        closed.push(actor);
        return Promise.resolve(true);
      },
    },
  };
  return { fake, written, closed, looked, asked };
}

/** The run's reply: what the person typed, and where. */
export const said = (text: string, waNotify: unknown = null) =>
  findingDraftReplyOf(text, waNotify);

/** Dana's private-chat reply "אשר 31" in tenant t1; `fields` override. */
export const input = (fields: Partial<ApproveInput> = {}): ApproveInput => ({
  tenantId: "t1",
  args: { short_code: 31 },
  requesterUserId: "dana",
  reply: said("אשר 31"),
  ...fields,
});
