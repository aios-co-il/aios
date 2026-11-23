import { skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cardDraftOf } from "../../../supabase/functions/_shared/manager-round/card-draft.ts";
import { FINDING_LIVE_STATUSES } from "../../../supabase/functions/_shared/manager-round/kinds.ts";

/** The most drafts the page lists at once. */
export const CARD_DRAFTS_LIMIT = 200;

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

/** Query key under the findings prefix the approve and dismiss mutations invalidate. */
export function cardDraftsKey(tenantId: string | null) {
  return ["carmen_findings", tenantId, "card-drafts"] as const;
}

/**
 * The tenant's live client-card drafts (card_stale_group findings), newest
 * first. RLS limits them to the ones the viewer may see, the same rule that
 * decides who may approve them.
 */
export function useCardDrafts(tenantId: string | null) {
  return useQuery({
    queryKey: cardDraftsKey(tenantId),
    queryFn: tenantId ? () => loadCardDrafts(tenantId) : skipToken,
  });
}

/** Reads the drafts with their client names. */
async function loadCardDrafts(tenantId: string): Promise<Array<CardDraftView>> {
  const { data, error } = await supabase
    .from("carmen_findings")
    .select(
      "id, short_code, summary_he, client_id, evidence, last_seen_at, client:clients(name)",
    )
    .eq("tenant_id", tenantId)
    .eq("kind", "card_stale_group")
    .in("status", [...FINDING_LIVE_STATUSES])
    .order("last_seen_at", { ascending: false })
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
