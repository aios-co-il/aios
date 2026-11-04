import { describe, expect, it } from "vitest";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { sharedCampaignTables } from "./sharedCampaignTables";

const campaign = (name: string, spend: number): FacebookCampaignRow => ({
  name,
  impressions: 100,
  clicks: 5,
  spend,
  leads: 1,
  purchases: 0,
  purchase_value: 0,
  add_to_cart: 0,
});

const pausedRecord = (campaign_name: string) => ({
  data: { date: "2026-10-20", campaign_name, effective_status: "PAUSED" },
});

describe("sharedCampaignTables", () => {
  it("keeps a paused campaign that spent, marked off, and drops one that spent nothing", () => {
    const tables = sharedCampaignTables(
      [
        pausedRecord("Paused spent"),
        pausedRecord("Paused idle"),
        { data: { date: "2026-10-20", campaign_name: "Live" } },
      ],
      {
        integrationType: "facebook_ads",
        level: "campaign",
        tableGoals: { goalOf: null, hasEcommerce: false, hasLeads: true },
        tableMode: "leads",
      },
      {
        ecommerce: [],
        leads: [
          campaign("Paused spent", 40),
          campaign("Paused idle", 0),
          campaign("Live", 0),
        ],
        traffic: [],
      },
    );
    expect(tables.leads.map((row) => [row.name, row.off])).toStrictEqual([
      ["Paused spent", true],
      ["Live", false],
    ]);
    expect(tables.all).toHaveLength(2);
  });
});
