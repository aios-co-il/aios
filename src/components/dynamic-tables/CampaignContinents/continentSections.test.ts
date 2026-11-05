import { describe, expect, it } from "vitest";
import type { GoogleAdsCampaignSummaryRow } from "../GoogleAdsCampaignSection/types";
import {
  continentSections,
  namesCampaignsByDestination,
} from "./continentSections";

const row = (
  name: string,
  spend: number,
  conversions = 0,
): GoogleAdsCampaignSummaryRow => ({
  name,
  campaign_id: name,
  goal: "leads",
  off: false,
  impressions: 100,
  clicks: 10,
  spend,
  conversions,
  conversions_value: 0,
});

describe("continentSections", () => {
  it("groups campaigns by continent, biggest spend first and general last", () => {
    const sections = continentSections([
      row("טיולי חורף - Pmax", 900),
      row("טיול ליפן בשלכת - Pmax", 100, 1),
      row("טיול לפטגוניה - Pmax", 300),
      row("טיול לסין - Pmax", 250, 2),
    ]);
    expect(
      sections.map((section) => [
        section.title,
        section.campaigns.map((campaign) => campaign.name),
        section.totals.spend,
        section.leads.conversions,
      ]),
    ).toStrictEqual([
      ["אסיה", ["טיול ליפן בשלכת - Pmax", "טיול לסין - Pmax"], 350, 3],
      ["דרום אמריקה", ["טיול לפטגוניה - Pmax"], 300, 0],
      ["כללי", ["טיולי חורף - Pmax"], 900, 0],
    ]);
  });
});

describe("namesCampaignsByDestination", () => {
  it("is true when most campaigns name destinations on two continents", () => {
    expect(
      namesCampaignsByDestination([
        "טיול לפטגוניה - Pmax",
        "טיול ליפן - Pmax",
        "טיולי חורף - Pmax",
      ]),
    ).toBe(true);
  });

  it("is false for an account whose campaigns are not destinations", () => {
    expect(
      namesCampaignsByDestination(["Brand search", "PMax חנות", "רימרקטינג"]),
    ).toBe(false);
    expect(
      namesCampaignsByDestination(["טיול ליפן - Pmax", "טיול לסין - Pmax"]),
    ).toBe(false);
  });

  it("needs more than half of the campaigns to name a destination", () => {
    expect(
      namesCampaignsByDestination([
        "טיול ליפן - Pmax",
        "טיול לפרו - Pmax",
        "Brand search",
        "רימרקטינג",
      ]),
    ).toBe(false);
  });
});
