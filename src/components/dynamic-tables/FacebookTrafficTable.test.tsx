import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FacebookTrafficTable } from "./FacebookTrafficTable";
import { groupFacebookReportCampaigns } from "./facebookReportCampaigns";

const day = (campaign: string, data: Record<string, unknown>) => ({
  data: {
    date: "2026-10-20",
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    campaign_type: "traffic",
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});

/** Renders the traffic table the report builds from these stored rows. */
function renderTraffic(records: Array<{ data: Record<string, unknown> }>) {
  const { traffic } = groupFacebookReportCampaigns(records, "campaign", {
    leadsOnly: false,
  });
  render(
    <FacebookTrafficTable
      rows={traffic}
      entityHeader="קמפיין טראפיק"
      currency="₪"
    />,
  );
}

// Website traffic that picked up two follows from the ad's Follow button.
const websiteFollows = {
  destination_type: "WEBSITE",
  optimization_goal: "LINK_CLICKS",
  new_followers: 2,
};

const headers = () =>
  screen.getAllByRole("columnheader").map((cell) => cell.textContent);
const cells = (name: string) =>
  [...(screen.getByText(name).closest("tr")?.children ?? [])].map(
    (cell) => cell.textContent,
  );

describe("FacebookTrafficTable", () => {
  it("website traffic keeps clicks, CTR and cost per click only", () => {
    renderTraffic([day("Blog", { spend: 100, clicks: 200 })]);
    expect(headers()).toStrictEqual([
      "קמפיין טראפיק",
      "חשיפות",
      "קליקים",
      "הוצאה",
      "CTR",
      "עלות לקליק",
    ]);
    expect(cells("סה״כ")).toStrictEqual([
      "סה״כ",
      "1,000",
      "200",
      "₪100",
      "20%",
      "₪0.5",
    ]);
  });

  it("website traffic with a few follows gets no follower columns", () => {
    renderTraffic([day("Blog", { ...websiteFollows, spend: 300 })]);
    expect(headers().slice(-2)).toStrictEqual(["CTR", "עלות לקליק"]);
  });

  it("profile traffic adds new followers and cost per follower", () => {
    renderTraffic([
      day("Profile", {
        optimization_goal: "PROFILE_VISIT",
        spend: 60,
        new_followers: 12,
      }),
      day("Profile", {
        date: "2026-10-21",
        destination_type: "INSTAGRAM_PROFILE",
        spend: 60,
        new_followers: 18,
      }),
      day("Blog", { ...websiteFollows, spend: 300 }),
    ]);
    expect(headers().slice(-2)).toStrictEqual(["עוקבים חדשים", "עלות לעוקב"]);
    expect(cells("Profile").slice(-2)).toStrictEqual(["30", "₪4"]);
    // A website campaign shows its follows but has no cost per follower.
    expect(cells("Blog").slice(-2)).toStrictEqual(["2", "—"]);
    // Its spend stays out of the total cost per follower.
    expect(cells("סה״כ").slice(-2)).toStrictEqual(["32", "₪4"]);
  });

  it("rows synced before new_followers add neither followers nor spend", () => {
    renderTraffic([
      day("Profile", { optimization_goal: "PROFILE_VISIT", spend: 300 }),
      day("Profile", {
        date: "2026-10-21",
        destination_type: "INSTAGRAM_PROFILE",
        spend: 120,
        new_followers: 30,
      }),
      day("Older profile", { optimization_goal: "PROFILE_VISIT", spend: 80 }),
    ]);
    expect(cells("Profile").slice(-2)).toStrictEqual(["30", "₪4"]);
    expect(cells("Older profile").slice(-2)).toStrictEqual(["—", "—"]);
    expect(cells("סה״כ").slice(-2)).toStrictEqual(["30", "₪4"]);
  });
});
