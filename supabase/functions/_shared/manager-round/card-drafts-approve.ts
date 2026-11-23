/**
 * The contract of carmen-card-drafts-approve, shared by the edge function and
 * the card-drafts page: the request limit and the per-finding results.
 */

/** The most findings one approval request may name. */
export const CARD_DRAFTS_APPROVE_MAX = 50;

/**
 * approved: the entry is on the card and the finding is closed (or was closed
 * meanwhile); not_found: not a live card draft the caller may see; no_draft:
 * the finding carries no usable draft; error: the write failed (`code` names
 * a card refusal when there is one).
 */
export type CardDraftApproveStatus =
  "approved" | "not_found" | "no_draft" | "error";

export type CardDraftApproveResult = {
  id: string;
  status: CardDraftApproveStatus;
  code?: string;
};

export type CardDraftsApproveResponse = {
  results: Array<CardDraftApproveResult>;
};
