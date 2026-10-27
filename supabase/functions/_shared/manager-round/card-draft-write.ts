/**
 * Writes a finding's drafted entry on the client card and closes the finding,
 * in that order: the entry is idempotent on its source_ref, so a retry after
 * a failed close returns the same entry and closes it then. Used by the
 * manager round (Carmen writes, no actor) and by approve_card_draft (the
 * approving person is the actor).
 */
import {
  type ClientCardEntryInput,
  type ClientCardEntryResult,
  recordClientCardEntry,
} from "../client-card.ts";
import type { DbClient } from "../supabase-clients.ts";
import {
  type CardDraft,
  cardDraftEntry,
  type DraftedFinding,
} from "./card-draft.ts";

export type CardDraftWritePorts = {
  writeEntry(input: ClientCardEntryInput): Promise<ClientCardEntryResult>;
  /** False when the finding is no longer live (already approved or closed). */
  resolveWritten(
    tenantId: string,
    findingId: string,
    entryId: string,
    actorUserId: string | null,
  ): Promise<boolean>;
};

export type CardDraftWrite = {
  tenantId: string;
  finding: DraftedFinding;
  draft: CardDraft;
  /** The person who approved it; null when Carmen writes it herself. */
  approvedBy: string | null;
};

export type CardDraftWritten = {
  entryId: string;
  /** false when the entry was already on the card. */
  inserted: boolean;
  attributedUserId: string;
  /** false when the finding had already been closed. */
  resolved: boolean;
};

/** Writes the entry, then resolves the finding as fixed. */
export async function writeCardDraft(
  ports: CardDraftWritePorts,
  write: CardDraftWrite,
): Promise<CardDraftWritten> {
  const entry = await ports.writeEntry(
    cardDraftEntry(
      write.tenantId,
      write.finding,
      write.draft,
      write.approvedBy,
    ),
  );
  const resolved = await ports.resolveWritten(
    write.tenantId,
    write.finding.id,
    entry.entryId,
    write.approvedBy,
  );
  return {
    entryId: entry.entryId,
    inserted: entry.inserted,
    attributedUserId: entry.userId,
    resolved,
  };
}

/** The ports over a service-role client. */
export function cardDraftWritePorts(db: DbClient): CardDraftWritePorts {
  return {
    writeEntry: (input) => recordClientCardEntry(db, input),
    async resolveWritten(tenantId, findingId, entryId, actorUserId) {
      const { data, error } = await db.rpc(
        "carmen_finding_resolve_card_written",
        {
          p_tenant_id: tenantId,
          p_finding_id: findingId,
          p_entry_id: entryId,
          p_actor_user_id: actorUserId ?? undefined,
        },
      );
      if (error) {
        throw new Error(
          `carmen_finding_resolve_card_written: ${error.message}`,
        );
      }
      return data === true;
    },
  };
}
