import { describe, expect, it } from "vitest";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import { combinedContinents } from "./combinedContinents";
import { continentSections } from "./continentSections";
import { facebookContinentSections } from "./facebookContinentSections";

/** A Google Ads lead campaign with this spend and these conversions. */
function googleCampaign(
  name: string,
  spend: number,
  conversions: number,
): GoogleAdsCampaignSummaryRow {
  return {
    name,
    campaign_id: name,
    goal: "leads",
    off: false,
    impressions: 0,
    clicks: 0,
    spend,
    conversions,
    conversions_value: 0,
  };
}

describe("combinedContinents", () => {
  it("lists every continent either platform has, by results, with כללי last", () => {
    const japan = {
      name: "טיול ליפן",
      impressions: 0,
      clicks: 0,
      spend: 5000,
      leads: 2,
      purchases: 0,
      purchase_value: 0,
      add_to_cart: 0,
    };
    const meta = facebookContinentSections({
      ecommerce: [],
      leads: [japan],
      traffic: [],
      all: [japan],
    });
    const google = continentSections([
      googleCampaign("טיול לפרו", 10, 7),
      googleCampaign("Brand", 900, 50),
    ]);

    const continents = combinedContinents(meta, google);

    expect(
      continents.map(({ title, facebook, google: own }) => [
        title,
        facebook !== null,
        own !== null,
      ]),
    ).toStrictEqual([
      ["דרום אמריקה", false, true],
      ["אסיה", true, false],
      ["כללי", false, true],
    ]);
  });
});
