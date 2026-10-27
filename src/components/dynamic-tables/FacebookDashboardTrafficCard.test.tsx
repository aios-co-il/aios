import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  aggregateFacebookCampaignsFromRecords,
  groupFacebookCampaigns,
} from "@/lib/adsMetrics";
import { FacebookDashboardTrafficCard } from "./FacebookDashboardTrafficCard";

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

/** Renders the traffic card the dashboards build from these stored rows. */
function renderDashboardTraffic(
  records: Array<{ data: Record<string, unknown> }>,
) {
  const { traffic } = groupFacebookCampaigns(
    aggregateFacebookCampaignsFromRecords(records),
  );
  render(
    <FacebookDashboardTrafficCard
      rows={traffic}
      formatCurrency={(value) => `₪${value}`}
      formatNumber={(value) => String(value)}
    />,
  );
}

const cells = (name: string) =>
  [...(screen.getByText(name).closest("tr")?.children ?? [])].map(
    (cell) => cell.textContent,
  );

describe("FacebookDashboardTrafficCard", () => {
  it("shows a profile campaign's new followers and cost per follower", () => {
    renderDashboardTraffic([
      day("Profile", {
        destination_type: "INSTAGRAM_PROFILE",
        spend: 120,
        new_followers: 30,
      }),
      day("Blog", { destination_type: "WEBSITE", spend: 300 }),
    ]);
    expect(screen.getByText("קמפיינים טראפיק - Facebook")).toBeTruthy();
    expect(
      screen
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent)
        .slice(-2),
    ).toStrictEqual(["עוקבים חדשים", "עלות לעוקב"]);
    expect(cells("Profile").slice(-2)).toStrictEqual(["30", "₪4"]);
    expect(cells('סה"כ').slice(-2)).toStrictEqual(["30", "₪4"]);
  });

  it("website traffic keeps the click columns only", () => {
    renderDashboardTraffic([day("Blog", { spend: 300 })]);
    expect(screen.queryByText("עוקבים חדשים")).toBeNull();
  });
});
