import { describe, expect, it } from "vitest";
import { googleLeadCampaignRecords } from "./googleLeadCampaignRecords";

const table = {
  id: "g",
  integration_type: "google_ads",
  integration_settings: { campaign_type: "leads" },
};
const record = (campaign: string, goal?: string) => ({
  data: {
    date: "2026-10-20",
    campaign_id: campaign,
    campaign_name: campaign,
    cost: 100,
    conversions: 2,
    ...(goal ? { conversion_goal: goal } : {}),
  },
});

describe("googleLeadCampaignRecords", () => {
  it("leaves sales campaigns out of lead-only figures", () => {
    const records = [
      record("shop", "ecommerce"),
      record("search", "leads"),
      record("old"),
    ];
    expect(
      googleLeadCampaignRecords(records, table).map((r) => r.data.campaign_id),
    ).toStrictEqual(["search", "old"]);
  });
});
