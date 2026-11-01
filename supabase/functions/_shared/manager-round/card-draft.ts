/**
 * A client card entry a finding drafts (evidence.card_draft), shared by the
 * manager round, which drafts it and, in team mode with card_write on, writes
 * it, and Carmen's approve_card_draft tool, which writes it when a staff
 * member replies "אשר <code>" (AIO-254). The drafted entry itself never
 * counts as client contact: a group digest is information, not a
 * conversation with the client. A call or meeting the group reports is a
 * separate entry the draft may carry (card-contact.ts), written only on a
 * person's approval.
 */
import type { ClientCardEntryInput } from "../client-card/entry-types.ts";
import {
  CLIENT_CARD_SOURCE_LABELS,
  type ClientCardSource,
} from "../client-card/sources.ts";
import type { Json } from "../database.types.ts";
import { type ContactDraft, contactDraftOf } from "./card-contact.ts";
import { jsonObject } from "./json-object.ts";

/** The reply word, sent before the finding's code. */
export const APPROVE_DRAFT_WORD_HE = "אשר";

/** The reply word (or its plural or feminine imperative), then the code. */
const APPROVE_REPLY = new RegExp(
  `(?:^|\\s)${APPROVE_DRAFT_WORD_HE}[יו]?\\s*#?(\\d{1,7})(?!\\d)`,
);

/** The card sources a finding may draft; each is a client card source. */
export const CARD_DRAFT_SOURCES = [
  "group_digest",
] as const satisfies readonly ClientCardSource[];

/** The card update types a finding may draft, with the card's label for each. */
export const CARD_DRAFT_TYPES = [
  { value: "group_summary", label: "סיכום קבוצה" },
] as const;

export type CardDraft = {
  source: (typeof CARD_DRAFT_SOURCES)[number];
  update_type: (typeof CARD_DRAFT_TYPES)[number]["value"];
  /** The card's dedupe key, e.g. `<group_id>:<last_message_id>`. */
  source_ref: string;
  content: string;
  /** A call or meeting the group reported as held, written beside it on approval. */
  contact?: ContactDraft;
};

/** The finding a draft is written for. */
export type DraftedFinding = {
  id: string;
  short_code: number;
  client_id: string;
};

/** evidence.card_draft when it is a well-formed draft, else null. */
export function cardDraftOf(evidence: Json): CardDraft | null {
  const draft = jsonObject(jsonObject(evidence)?.card_draft);
  const source = CARD_DRAFT_SOURCES.find((s) => s === draft?.source);
  const type = CARD_DRAFT_TYPES.find(
    (t) => t.value === draft?.update_type,
  )?.value;
  const ref = text(draft?.source_ref);
  const content = text(draft?.content);
  const contact = contactDraftOf(draft?.contact);
  return source && type && ref && content
    ? {
        source,
        update_type: type,
        source_ref: ref,
        content,
        ...(contact ? { contact } : {}),
      }
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

/**
 * The entry text: the source's prefix, then the wording. The prefix names
 * Carmen and the source's card label, so readers see who wrote it.
 */
export function cardDraftContent(
  source: CardDraft["source"],
  wording: string,
): string {
  const prefix = `[${CLIENT_CARD_SOURCE_LABELS.carmen} · ${CLIENT_CARD_SOURCE_LABELS[source]}]`;
  return `${prefix} ${wording.trim()}`;
}

/** The finding code in a reply such as "אשר 123", "אשרי #123" or "אשרו 123"; else null. */
export function parseApproveDraftReply(message: string): number | null {
  const match = APPROVE_REPLY.exec(message);
  return match ? Number(match[1]) : null;
}

/** A trimmed non-empty string, or null. */
function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
