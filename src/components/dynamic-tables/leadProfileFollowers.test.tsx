import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WeeklyGoalTable } from "@/components/reports/WeeklyGoalTable";
import {
  dashboardFacebookCampaigns,
  dashboardRecordGoalOf,
} from "@/lib/dashboardCampaignGoals";
import { buildWeeklyCampaignSections } from "@/lib/weeklyAdsComparison";
import { FacebookDashboardLeadsCard } from "./FacebookDashboardLeadsCard";
import { FacebookLeadsTable } from "./FacebookLeadsTable";
import { groupFacebookReportCampaigns } from "./facebookReportCampaigns";

/**
 * Aimee's Instagram campaign: profile-visit traffic that measures enough leads
 * to count as leads (AIO-514), and still gains followers.
 */
const records = [
  {
    _source: "facebook_insights",
    _tableId: "fb",
    data: {
      date: "2026-09-14",
      campaign_id: "IG",
      campaign_name: "Instagram",
      entity_level: "campaign",
      campaign_type: "lead",
      campaign_objective: "OUTCOME_TRAFFIC",
      optimization_goal: "PROFILE_VISIT",
      destination_type: "INSTAGRAM_PROFILE",
      impressions: 1000,
      clicks: 80,
      spend: 120,
      leads: 6,
      new_followers: 40,
    },
  },
];

/** The rendered table shows new followers and cost per follower. */
function expectFollowerColumns() {
  expect(screen.getByText("עוקבים חדשים")).toBeTruthy();
  expect(screen.getByText("עלות לעוקב")).toBeTruthy();
}

describe("a profile campaign counted as leads keeps its follower columns", () => {
  it("on the dashboards", () => {
    const tables = [
      {
        id: "fb",
        integration_type: "facebook_insights",
        integration_settings: {},
      },
    ];
    const { leads } = dashboardFacebookCampaigns(
      records,
      dashboardRecordGoalOf(records, tables),
    );
    expect(leads.map((row) => row.name)).toStrictEqual(["Instagram"]);
    render(
      <FacebookDashboardLeadsCard
        rows={leads}
        formatCurrency={String}
        formatUnitCost={String}
        formatNumber={String}
      />,
    );
    expectFollowerColumns();
  });

  it("in the table report", () => {
    const { leads } = groupFacebookReportCampaigns(records, "campaign", {
      leadsOnly: false,
    });
    render(
      <FacebookLeadsTable
        rows={leads}
        entityHeader="קמפיין לידים"
        currency="₪"
      />,
    );
    expectFollowerColumns();
  });

  it("in the weekly comparison", () => {
    const [week] = buildWeeklyCampaignSections(records, {
      now: new Date("2026-09-18T12:00:00Z"),
    });
    const group = week.groups.find((candidate) => candidate.kind === "leads");
    if (!group) {
      throw new Error("the week has no leads group");
    }
    render(
      <WeeklyGoalTable
        group={group}
        currency="₪"
        showPlatform={false}
        showTitle={false}
      />,
    );
    expectFollowerColumns();
  });
});
