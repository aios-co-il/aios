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
      day("Blog", { spend: 300 }),
    ]);
    expect(headers().slice(-2)).toStrictEqual(["עוקבים חדשים", "עלות לעוקב"]);
    expect(cells("Profile").slice(-2)).toStrictEqual(["30", "₪4"]);
    expect(cells("Blog").slice(-2)).toStrictEqual(["0", "—"]);
    // Website traffic spend stays out of the total cost per follower.
    expect(cells("סה״כ").slice(-2)).toStrictEqual(["30", "₪4"]);
  });
});
