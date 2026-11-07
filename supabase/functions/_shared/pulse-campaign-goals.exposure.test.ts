import { assertStrictEquals } from "jsr:@std/assert@1";
import { buildPulseCampaignRows } from "./pulse-campaign-goals.mjs";

const googleTable = (id: string, settings: Record<string, unknown> = {}) => ({
  id,
  client_id: "c1",
  integration_type: "google_ads",
  integration_settings: settings,
  category: "Google Ads",
});
const googleRow = (
  table_id: string,
  date: string,
  data: Record<string, unknown>,
) => ({
  table_id,
  data: { date, entity_level: "campaign", ...data },
});
const lastWeek = [
  "2026-10-17",
  "2026-10-18",
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
];

Deno.test(
  "a Google Display campaign that pays per impression and measures no conversions is traffic and never alerts (AIO-496)",
  () => {
    // A Display campaign on manual CPM that measures no conversion goal, spending.
    const records = lastWeek.map((date) =>
      googleRow("g", date, {
        campaign_id: "9",
        campaign_name: "באנרים",
        campaign_channel_type: "DISPLAY",
        bidding_strategy_type: "MANUAL_CPM",
        cost: 12,
        clicks: 4,
        conversions: 0,
      }),
    );
    const rows = buildPulseCampaignRows({
      records,
      tables: [googleTable("g", { campaign_type: "leads" })],
      nowYmd: "2026-10-24",
    });
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0].goal, "engagement");
    assertStrictEquals(rows[0].alert_eligible, false);
  },
);
