/**
 * The card entry a contact_not_logged finding drafts (evidence.draft), shared
 * by the manager round's contact collector, which writes it, and Carmen's
 * confirm_finding_draft tool, which logs it when the responsible person
 * replies "תעדי <code>" (AIO-253).
 */
import type { Json } from "../database.types.ts";

/** The reply word, sent before the finding's code. */
export const CONFIRM_DRAFT_WORD_HE = "תעדי";

export const CONTACT_DRAFT_TYPES = ["call", "meeting"] as const;

export type ContactDraftType = (typeof CONTACT_DRAFT_TYPES)[number];

export type ContactDraft = { update_type: ContactDraftType; text_he: string };

/** evidence.draft when it is a well-formed contact draft, else null. */
export function contactDraftOf(evidence: Json): ContactDraft | null {
  const draft = field(evidence, "draft");
  const updateType = field(draft, "update_type");
  const text = field(draft, "text_he");
  const type = CONTACT_DRAFT_TYPES.find((known) => known === updateType);
  return type && typeof text === "string" && text.trim()
    ? { update_type: type, text_he: text.trim() }
    : null;
}

/** The finding code in a reply such as "תעדי 123", "תעד #123" or "תעדו 123"; else null. */
export function parseConfirmDraftReply(text: string): number | null {
  const match = /(?:^|\s)תעד[יו]?\s*#?(\d{1,7})(?!\d)/.exec(text);
  return match ? Number(match[1]) : null;
}

/** A key of a JSON object, or undefined for anything else. */
function field(value: Json | undefined, key: string): Json | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value[key]
    : undefined;
}
