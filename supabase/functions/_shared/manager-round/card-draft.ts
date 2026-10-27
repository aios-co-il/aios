/**
 * A client card entry a finding drafts (evidence.card_draft), shared by the
 * manager round, which drafts it and, in team mode with card_write on, writes
 * it, and Carmen's approve_card_draft tool, which writes it when a staff
 * member replies "אשר <code>" (AIO-254). Only entries that never count as
 * client contact can be drafted this way: a group digest is information, not
 * a conversation with the client.
 */
import type { ClientCardEntryInput } from "../client-card/entry-types.ts";
import type { Json } from "../database.types.ts";

/** The reply word, sent before the finding's code. */
export const APPROVE_DRAFT_WORD_HE = "אשר";

export const CARD_DRAFT_SOURCES = ["group_digest"] as const;

export const CARD_DRAFT_TYPES = ["group_summary"] as const;

/** How each kind of drafted entry opens on the card, so readers see who wrote it. */
export const CARD_DRAFT_PREFIX_HE: Record<CardDraft["source"], string> = {
  group_digest: "[כרמן · סיכום קבוצה]",
};

export type CardDraft = {
  source: (typeof CARD_DRAFT_SOURCES)[number];
  update_type: (typeof CARD_DRAFT_TYPES)[number];
  /** The card's dedupe key, e.g. `<group_id>:<last_message_id>`. */
  source_ref: string;
  content: string;
};

/** The finding a draft is written for. */
export type DraftedFinding = {
  id: string;
  short_code: number;
  client_id: string;
};

/** evidence.card_draft when it is a well-formed draft, else null. */
export function cardDraftOf(evidence: Json): CardDraft | null {
  const draft = field(evidence, "card_draft");
  const source = CARD_DRAFT_SOURCES.find((s) => s === field(draft, "source"));
  const type = CARD_DRAFT_TYPES.find((t) => t === field(draft, "update_type"));
  const ref = text(field(draft, "source_ref"));
  const content = text(field(draft, "content"));
  return source && type && ref && content
    ? { source, update_type: type, source_ref: ref, content }
    : null;
}

/**
 * The card entry for a draft: attributed to the client's campaigner (the
 * writer's fallback), never counted as contact, deduplicated on the draft's
 * source_ref so a repeated approval returns the first entry.
 */
export function cardDraftEntry(
  tenantId: string,
  finding: DraftedFinding,
  draft: CardDraft,
  approvedBy: string | null,
): ClientCardEntryInput {
  return {
    tenantId,
    clientId: finding.client_id,
    content: draft.content,
    updateType: draft.update_type,
    source: draft.source,
    sourceRef: draft.source_ref,
    attributedUserId: null,
    countsAsContact: false,
    metadata: {
      finding_id: finding.id,
      short_code: finding.short_code,
      written_by: approvedBy ? "approval" : "carmen",
      approved_by: approvedBy,
    },
  };
}

/** The entry text: the source's prefix, then the wording. */
export function cardDraftContent(
  source: CardDraft["source"],
  wording: string,
): string {
  return `${CARD_DRAFT_PREFIX_HE[source]} ${wording.trim()}`;
}

/** The finding code in a reply such as "אשר 123", "אשרי #123" or "אשרו 123"; else null. */
export function parseApproveDraftReply(message: string): number | null {
  const match = /(?:^|\s)אשר[יו]?\s*#?(\d{1,7})(?!\d)/.exec(message);
  return match ? Number(match[1]) : null;
}

/** A key of a JSON object, or undefined for anything else. */
function field(value: Json | undefined, key: string): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value[key]
    : undefined;
}

/** A trimmed non-empty string, or null. */
function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
