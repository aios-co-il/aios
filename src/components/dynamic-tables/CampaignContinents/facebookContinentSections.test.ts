import { describe, expect, it } from "vitest";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { facebookContinentSections } from "./facebookContinentSections";

/** A Meta campaign with this spend and these leads and purchases. */
function campaign(
  name: string,
  spend: number,
  results: { leads?: number; purchases?: number } = {},
): FacebookCampaignRow {
  return {
    name,
    impressions: 1000,
    clicks: 40,
    spend,
    leads: results.leads ?? 0,
    purchases: results.purchases ?? 0,
    purchase_value: 0,
    add_to_cart: 0,
  };
}

describe("facebookContinentSections", () => {
  it("groups Meta campaigns by the continent their name names, keeping each goal", () => {
    const japan = campaign("טיול ליפן | לידים", 300, { leads: 6 });
    const peru = campaign("טיול לפרו | לידים", 900, { leads: 9 });
    const brand = campaign("מותג | תנועה", 50);

    const sections = facebookContinentSections({
      ecommerce: [],
      leads: [japan, peru],
      traffic: [brand],
      all: [japan, peru, brand],
    });

    expect(sections.map((section) => section.title)).toStrictEqual([
      "דרום אמריקה",
      "אסיה",
      "כללי",
    ]);
    expect(sections[1].campaigns.leads).toStrictEqual([japan]);
    expect(sections[2].campaigns.traffic).toStrictEqual([brand]);
  });

  it("sets each continent's results against its lead and sales spend only", () => {
    const leads = campaign("טיול לוייטנאם | לידים", 400, { leads: 8 });
    const traffic = campaign("טיול לוייטנאם | תנועה", 600);

    const [asia] = facebookContinentSections({
      ecommerce: [],
      leads: [leads],
      traffic: [traffic],
      all: [leads, traffic],
    });

    expect(asia.totals.spend).toBe(1000);
    expect(asia.resultSpend).toBe(400);
  });
});
