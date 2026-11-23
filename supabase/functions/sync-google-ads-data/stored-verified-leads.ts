/**
 * Keeps the WordPress lead counts already stored for days the current
 * Elementor fetch does not cover. The window write deletes the stored rows and
 * inserts the fetched ones, so a day left unannotated would lose its
 * verified_leads and verified_source.
 */
import { fetchCampaignLevelRecords } from "../_shared/ads-sync/campaign-records.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { shiftDateString } from "../_shared/report-sync-window.ts";

export type VerifiedRecord = {
  date: string;
  campaign_id: string;
  entity_level?: string;
  verified_leads?: number;
  verified_source?: string;
};

/**
 * Copies stored verified_leads and verified_source onto the campaign records
 * dated before `coveredFrom` that carry none, matched by date and campaign id.
 * Reads before the write replaces the rows; throws on a read error so the run
 * fails instead of erasing them.
 */
export async function carryStoredVerifiedLeads(
  client: DbClient,
  input: {
    tableId: string;
    tenantId: string;
    records: Array<VerifiedRecord>;
    coveredFrom: string;
  },
): Promise<void> {
  const uncovered = input.records.filter(
    (rec) =>
      (rec.entity_level || "campaign") === "campaign" &&
      rec.date < input.coveredFrom &&
      rec.verified_leads === undefined,
  );
  if (!uncovered.length) {
    return;
  }
  const stored = await fetchCampaignLevelRecords(client, {
    tableIds: [input.tableId],
    tenantIds: [input.tenantId],
    sinceYmd: uncovered.reduce(
      (min, rec) => (rec.date < min ? rec.date : min),
      uncovered[0].date,
    ),
    untilYmd: shiftDateString(input.coveredFrom, -1),
  });
  const byKey = new Map<string, Record<string, unknown>>();
  for (const row of stored) {
    if (row.data) {
      byKey.set(`${row.data.date}|${row.data.campaign_id}`, row.data);
    }
  }
  for (const rec of uncovered) {
    const data = byKey.get(`${rec.date}|${rec.campaign_id}`);
    if (typeof data?.verified_leads === "number") {
      rec.verified_leads = data.verified_leads;
    }
    if (typeof data?.verified_source === "string") {
      rec.verified_source = data.verified_source;
    }
  }
}
