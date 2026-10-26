/**
 * Recorded-shape Meta Graph API responses and a stored report table, for the
 * ads sync write tests. stubGraph replaces globalThis.fetch; restore it after.
 */
import { createFakeDb, type FakeDb, type Row } from "./fake-postgrest.ts";

export const WINDOW = { startDate: "2026-10-24", endDate: "2026-10-26" };
export const PREVIOUS_SYNC = "2026-10-25T04:40:00.000Z";
export const RUN_AT = "2026-10-26T04:40:00.000Z";
export const NOW = Date.parse("2026-10-26T05:00:00.000Z");

/** Recorded Graph API error (rate limit mid-pagination). */
export const GRAPH_RATE_LIMIT = {
  error: {
    message: "(#17) User request limit reached",
    type: "OAuthException",
    code: 17,
    error_subcode: 2446079,
    fbtrace_id: "AbCdEf123",
  },
};

export const insight = (level: string, date: string, spend: string) => ({
  campaign_id: "120200000000001",
  campaign_name: "לידים - חורף",
  ...(level !== "campaign"
    ? { adset_id: "120200000000101", adset_name: "קהל חם" }
    : {}),
  ...(level === "ad" ? { ad_id: "120200000001001", ad_name: "וידאו 1" } : {}),
  date_start: date,
  date_stop: date,
  impressions: "1000",
  clicks: "25",
  spend,
  actions: [{ action_type: "lead", value: "4" }],
});

/** Graph responses per level: rows (one page each), or pages ending in an error. */
export function stubGraph(
  levels: Record<string, unknown[][] | "error-on-page-2">,
) {
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    const level =
      url.match(/level=(\w+)/)?.[1] || url.match(/page2-(\w+)/)?.[1];
    const spec = levels[level as string];
    const page2 = url.includes("page2-");
    if (spec === "error-on-page-2") {
      const body = page2
        ? GRAPH_RATE_LIMIT
        : {
            data: [insight(level as string, "2026-10-24", "50")],
            paging: { next: `https://graph.facebook.com/page2-${level}` },
          };
      return new Response(JSON.stringify(body));
    }
    return new Response(
      JSON.stringify({ data: (spec || [[]])[0], paging: {} }),
    );
  }) as typeof fetch;
}

export function storedTable(): FakeDb {
  const rec = (date: string, level: string | null, spend: number): Row => ({
    id: `seed-${date}-${level}`,
    table_id: "t1",
    tenant_id: "tenant-1",
    data: { date, spend, ...(level ? { entity_level: level } : {}) },
  });
  return createFakeDb({
    crm_records: [
      rec("2026-06-01", "campaign", 10), // history outside the window
      rec("2026-10-23", "campaign", 11),
      rec("2026-10-24", null, 12), // legacy row: no entity_level = campaign
      rec("2026-10-25", "campaign", 13),
      rec("2026-10-25", "adset", 14),
      rec("2026-10-25", "ad", 15),
    ],
    crm_tables: [
      {
        id: "t1",
        last_sync_at: PREVIOUS_SYNC,
        integration_settings: {
          currency: "USD",
          last_sync_at: PREVIOUS_SYNC,
          scheduled_synced_through: "2026-10-25",
        },
      },
    ],
  });
}
