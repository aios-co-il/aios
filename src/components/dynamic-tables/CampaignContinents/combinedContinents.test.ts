import { describe, expect, it } from "vitest";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import { combinedContinents, continentPlatforms } from "./combinedContinents";
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
  it("lists Meta's continents, then Google-only ones, with כללי last", () => {
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
      ["אסיה", true, false],
      ["דרום אמריקה", false, true],
      ["כללי", false, true],
    ]);
  });
});

describe("continentPlatforms", () => {
  /** A campaign row of this source and name. */
  function row(
    _source: string,
    campaign_name: string,
    entity_level = "campaign",
  ) {
    return { _source, data: { campaign_name, entity_level } };
  }

  it("leaves a client whose campaigns name no destinations without the tab", () => {
    expect(
      continentPlatforms([
        row("facebook_insights", "לידים | קהל דומה"),
        row("facebook_insights", "רימרקטינג"),
        row("google_ads", "Brand search"),
      ]),
    ).toStrictEqual({ facebook: false, google: false });
  });

  it("reads each platform on its own, Meta from campaign rows only", () => {
    const platforms = continentPlatforms([
      row("facebook_ecommerce", "טיול ליפן | לידים"),
      row("facebook_ecommerce", "טיול לפרו | לידים"),
      row("facebook_insights", "טיול לאיטליה", "adset"),
      row("google_ads", "Brand search"),
    ]);

    expect(platforms).toStrictEqual({ facebook: true, google: false });
    expect(
      continentPlatforms([
        row("facebook_insights", "טיול ליפן", "adset"),
        row("facebook_insights", "טיול לפרו", "adset"),
      ]).facebook,
    ).toBe(false);
  });
});
