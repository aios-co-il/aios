import {
  pulseTableTypeRank,
  resolvePulseTargetAcross,
  type ResolvedPulseTarget,
} from "./targets/resolve.ts";

/** A report table as buildPulseCampaignRows reads it. */
export type CampaignTable = {
  id: string;
  integration_type?: string | null;
  integration_settings?: unknown;
};

/** One table a campaign is read from, with the id and name that table stores it under. */
export type CampaignPlace = {
  table: CampaignTable;
  identity: { id: string | null; name: string };
};

/** One daily row of a campaign, scored by how well it describes the campaign. */
export type CampaignItem = CampaignPlace & {
  score: number;
  record: { data: { date?: unknown } };
};

/**
 * Remembers that the campaign keyed `campaignKey` is read from this table under
 * this id and name, including tables whose daily rows lose the per-day pick: a
 * target stored on any of them applies to the campaign.
 */
export function addCampaignPlace(
  placesByCampaign: Map<string, Map<string, CampaignPlace>>,
  campaignKey: string,
  place: CampaignPlace,
): void {
  const places =
    placesByCampaign.get(campaignKey) || new Map<string, CampaignPlace>();
  const placeKey = `${place.table.id}:${place.identity.id ?? ""}:${place.identity.name}`;
  if (!places.has(placeKey)) {
    places.set(placeKey, place);
  }
  placesByCampaign.set(campaignKey, places);
}

/** Every table the campaign is read from, in the order first seen. */
export function campaignPlaces(
  placesByCampaign: Map<string, Map<string, CampaignPlace>>,
  campaignKey: string,
): CampaignPlace[] {
  return [...(placesByCampaign.get(campaignKey)?.values() || [])];
}

/**
 * The target that applies to a campaign, over every table (and that table's own
 * campaign id and name) the campaign is read from, so duplicate report tables give
 * the same answer whichever of them the row was sampled from. The resolver breaks
 * ties itself, so the order of the places does not matter.
 */
export function campaignTarget(
  places: CampaignPlace[],
  goal: string,
): ResolvedPulseTarget | null {
  return resolvePulseTargetAcross(
    places.map(({ table, identity }) => ({
      tableId: table.id,
      integrationType: table.integration_type ?? null,
      settings: table.integration_settings || {},
      campaignId: identity.id,
      campaignName: identity.name === "ללא שם" ? null : identity.name,
    })),
    goal,
  );
}

/** The target columns of a pulse row (campaign_breakdown). */
export function campaignTargetFields(
  target: ResolvedPulseTarget | null,
  places: CampaignPlace[],
) {
  return {
    target_value: target?.value ?? null,
    target_kind: target?.kind ?? null,
    target_source: target?.source ?? null,
    target_scope: target?.scope ?? null,
    // Where the target is stored (a duplicate table may hold it) and Carmen's
    // reasoning for a market estimate, so the editor shows what the pulse used.
    target_table_id: target?.table_id ?? null,
    target_campaign_id: target?.campaign_id ?? null,
    target_rationale: target?.rationale ?? null,
    // Every table the campaign is read from (its target is resolved over these),
    // so Carmen's set_market_target checks the same tables.
    read_table_ids: [...new Set(places.map(({ table }) => table.id))].sort(),
  };
}

/**
 * Which of two rows of one campaign represents it (negative: `a`). The best scored
 * row wins; ties go to the goal's own table type, then table id, then the latest
 * day, then campaign id, so the pick never depends on the order the records came in.
 */
export function compareCampaignItems(
  a: CampaignItem,
  b: CampaignItem,
  goal: string,
): number {
  return (
    b.score - a.score ||
    pulseTableTypeRank(a.table.integration_type, goal) -
      pulseTableTypeRank(b.table.integration_type, goal) ||
    a.table.id.localeCompare(b.table.id) ||
    String(b.record.data.date || "").localeCompare(
      String(a.record.data.date || ""),
    ) ||
    (a.identity.id ?? "").localeCompare(b.identity.id ?? "")
  );
}
