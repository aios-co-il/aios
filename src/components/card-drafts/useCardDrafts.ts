import { skipToken, useQuery } from "@tanstack/react-query";
import { carmenFindingsKey, selectLiveFindings } from "@/lib/carmenFindings";
import { cardDraftOf } from "../../../supabase/functions/_shared/manager-round/card-draft.ts";

/** The most drafts the page lists at once. */
const CARD_DRAFTS_LIMIT = 200;

/** One draft as the page shows it: the text that approval writes on the card. */
export type CardDraftView = {
  id: string;
  shortCode: number;
  clientName: string | null;
  /** The drafted entry (evidence.card_draft.content), else the finding's summary. */
  text: string;
  /** The call or meeting the group reported, written beside it on approval. */
  contactText: string | null;
  lastSeenAt: string;
};

/**
 * The tenant's live client-card drafts (card_stale_group findings), newest
 * first. RLS limits them to the ones the viewer may see.
 */
export function useCardDrafts(tenantId: string | null) {
  return useQuery({
    queryKey: [...carmenFindingsKey(tenantId), "card-drafts"],
    queryFn: tenantId ? () => loadCardDrafts(tenantId) : skipToken,
  });
}

/** Reads the drafts with their client names. */
async function loadCardDrafts(tenantId: string): Promise<Array<CardDraftView>> {
  const { data, error } = await selectLiveFindings(
    tenantId,
    "id, short_code, summary_he, evidence, last_seen_at, client:clients(name)",
  )
    .eq("kind", "card_stale_group")
    .limit(CARD_DRAFTS_LIMIT);
  if (error) {
    throw error;
  }

  return data.map((row) => {
    const draft = cardDraftOf(row.evidence);
    return {
      id: row.id,
      shortCode: row.short_code,
      clientName: row.client?.name ?? null,
      text: draft?.content ?? row.summary_he,
      contactText: draft?.contact?.content ?? null,
      lastSeenAt: row.last_seen_at,
    };
  });
}
