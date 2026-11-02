import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "./facebookReportCampaigns";

const row = (campaign: string, data: Record<string, unknown>) => ({
  data: {
    campaign_id: campaign,
    campaign_name: campaign,
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});

describe("groupFacebookReportCampaigns", () => {
  it("sums each campaign's rows and splits the campaigns by goal", () => {
    const groups = groupFacebookReportCampaigns(
      [
        row("Shop", {
          campaign_objective: "OUTCOME_SALES",
          spend: 100,
          purchases: 2,
          purchase_value: 300,
          result_kind: "purchases",
          results: 2,
        }),
        row("Leads", { campaign_type: "lead", spend: 80, leads: 4 }),
        row("Shop", { spend: 50, purchases: 1, purchase_value: 150 }),
        row("Traffic", { campaign_type: "traffic", spend: 20, clicks: 300 }),
      ],
      "campaign",
      { leadsOnly: false },
    );
    const [[, shop]] = groups.ecommerce;
    expect(shop).toMatchObject({
      name: "Shop",
      impressions: 2000,
      spend: 150,
      purchases: 3,
      purchase_value: 450,
    });
    expect(shop.result).toMatchObject({ result_kind: "purchases", results: 2 });
    expect(groups.leads.map(([key]) => key)).toStrictEqual(["Leads"]);
    expect(groups.traffic.map(([key]) => key)).toStrictEqual(["Traffic"]);
  });

  it("a leads-only table shows sales campaigns as leads, traffic apart", () => {
    const groups = groupFacebookReportCampaigns(
      [
        row("Shop", { campaign_objective: "OUTCOME_SALES", purchases: 2 }),
        row("Traffic", { campaign_type: "traffic" }),
      ],
      "campaign",
      { leadsOnly: true },
    );
    expect(groups.ecommerce).toStrictEqual([]);
    expect(groups.leads.map(([key]) => key)).toStrictEqual(["Shop"]);
    expect(groups.traffic.map(([key]) => key)).toStrictEqual(["Traffic"]);
  });
});
