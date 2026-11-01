import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildWeeklyCampaignSections } from "@/lib/weeklyAdsComparison";
import { WeeklyGoalTable } from "./WeeklyGoalTable";

const traffic = (campaign: string, data: Record<string, unknown>) => ({
  _source: "facebook_insights",
  data: {
    date: "2026-09-14",
    campaign_id: campaign,
    campaign_name: campaign,
    entity_level: "campaign",
    campaign_type: "traffic",
    impressions: 1000,
    clicks: 100,
    ...data,
  },
});

/** Renders the week's traffic table built from these stored rows. */
function renderTrafficWeek(records: Array<ReturnType<typeof traffic>>) {
  const [week] = buildWeeklyCampaignSections(records, {
    now: new Date("2026-09-18T12:00:00Z"),
  });
  const group = week.groups.find((candidate) => candidate.kind === "traffic");
  if (!group) {
    throw new Error("the week has no traffic group");
  }
  render(
    <WeeklyGoalTable
      group={group}
      currency="₪"
      showPlatform={false}
      showTitle={false}
    />,
  );
  return screen.getByRole("region", { name: "קמפייני תנועה" });
}

// Website traffic that picked up two follows from the ad's Follow button.
const websiteFollows = {
  destination_type: "WEBSITE",
  optimization_goal: "LINK_CLICKS",
  new_followers: 2,
};

const headers = (region: HTMLElement) =>
  within(region)
    .getAllByRole("columnheader")
    .map((cell) => cell.textContent);
const cells = (row: HTMLElement | null) =>
  [...(row?.children ?? [])].map((cell) => cell.textContent);

describe("WeeklyGoalTable traffic followers", () => {
  it("website traffic has no follower columns, even with a few follows", () => {
    const region = renderTrafficWeek([
      traffic("Blog", { ...websiteFollows, spend: 50 }),
    ]);
    expect(headers(region)).toStrictEqual([
      "קמפיין",
      "חשיפות",
      "קליקים",
      "הוצאה",
      "עלות לקליק",
    ]);
  });

  it("profile traffic adds new followers and cost per follower", () => {
    const region = renderTrafficWeek([
      traffic("Profile", {
        optimization_goal: "PROFILE_VISIT",
        spend: 90,
        new_followers: 30,
      }),
      traffic("Blog", { ...websiteFollows, spend: 50 }),
    ]);
    expect(headers(region).slice(-2)).toStrictEqual([
      "עוקבים חדשים",
      "עלות לעוקב",
    ]);
    const row = (name: string) => within(region).getByText(name).closest("tr");
    expect(cells(row("Profile")).slice(-2)).toStrictEqual(["30", "₪3"]);
    // A website campaign shows its follows but has no cost per follower.
    expect(cells(row("Blog")).slice(-2)).toStrictEqual(["2", "—"]);
    // Its spend stays out of the total cost per follower.
    expect(cells(region.querySelector("tfoot tr")).slice(-2)).toStrictEqual([
      "32",
      "₪3",
    ]);
  });
});
