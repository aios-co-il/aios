import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import { groupSharedFacebookRows } from "@/components/SharedTable/sharedFacebookGroups";
import { summarizeSharedTableRecords } from "@/components/SharedTable/sharedTableSummary";
import type { CampaignGoal } from "./campaignGoals";
import {
  addFacebookGoalRecord,
  emptyFacebookGoalInputs,
  facebookCampaignGoal,
  facebookCampaignGoals,
} from "./facebookCampaignGoal";
import { buildWeeklyCampaignSections } from "./weeklyAdsComparison";
import { weeklySourceModesForTable } from "./weeklyCampaignGoals";

const NOW = new Date("2026-09-18T12:00:00Z");
const GOALS: CampaignGoal[] = ["ecommerce", "leads", "traffic"];

const campaign = (data: Record<string, unknown>) => ({
  _source: "facebook_insights",
  data: {
    date: "2026-09-14",
    campaign_id: "C",
    campaign_name: "C",
    entity_level: "campaign",
    impressions: 1000,
    clicks: 50,
    ...data,
  },
});

/** Every campaign has leads, so the KPIs show whether they were counted. */
const cases: Array<[string, Record<string, unknown>, CampaignGoal]> = [
  [
    "a legacy CONVERSIONS campaign stored as leads",
    { campaign_type: "lead", campaign_objective: "CONVERSIONS", leads: 5 },
    "leads",
  ],
  [
    "a legacy CONVERSIONS campaign stored as sales",
    {
      campaign_type: "ecommerce",
      campaign_objective: "CONVERSIONS",
      purchases: 2,
      purchase_value: 300,
      leads: 3,
    },
    "ecommerce",
  ],
  [
    "a sales objective without purchases",
    { campaign_objective: "OUTCOME_SALES", leads: 2 },
    "ecommerce",
  ],
  [
    "a stale sales type with a lead objective",
    {
      campaign_type: "ecommerce",
      campaign_objective: "OUTCOME_LEADS",
      purchases: 1,
      leads: 5,
    },
    "leads",
  ],
  [
    "a WhatsApp campaign stored as traffic",
    { campaign_type: "traffic", campaign_name: "WhatsApp לידים", leads: 4 },
    "leads",
  ],
  [
    "a view-content result with no stored type",
    { campaign_type: "other", result_kind: "view_content", leads: 2 },
    "ecommerce",
  ],
  ["a traffic campaign", { campaign_type: "traffic", leads: 1 }, "traffic"],
];

/** The goal each report surface gives the same campaign records. */
function goalsOnEverySurface(
  records: Array<ReturnType<typeof campaign>>,
  leadsOnly: boolean,
) {
  const settings = leadsOnly ? { campaign_type: "leads" } : {};
  const [week] = buildWeeklyCampaignSections(records, {
    now: NOW,
    sourceModes: weeklySourceModesForTable(settings),
  });
  const shared = groupSharedFacebookRows(records, "campaign", { leadsOnly });
  const internal = groupFacebookReportCampaigns(records, "campaign", {
    leadsOnly,
  });
  const summary = summarizeSharedTableRecords(records, {
    integrationType: "facebook_insights",
    goalOf: shared.goalOf,
    goals: {
      ecommerce: shared.ecommerce.length > 0,
      leads: shared.leads.length > 0,
    },
    forceLeadsOnly: shared.ecommerce.length === 0,
    forceEcommerceOnly: shared.leads.length === 0,
  });
  return {
    weekly: week.rows[0].kind,
    sharedTable: GOALS.find((goal) => shared[goal].length > 0),
    sharedSummary: summary.leads > 0 ? "leads" : "not leads",
    internalReport: GOALS.find((goal) => internal[goal].length > 0),
  };
}

describe("facebookCampaignGoal on every report surface", () => {
  it.each(cases)("%s gets the same goal everywhere", (_, data, goal) => {
    expect(goalsOnEverySurface([campaign(data)], false)).toStrictEqual({
      weekly: goal,
      sharedTable: goal,
      sharedSummary: goal === "leads" ? "leads" : "not leads",
      internalReport: goal,
    });
  });

  it.each(cases)("%s in a leads-only table", (_, data, goal) => {
    const expected = goal === "traffic" ? "traffic" : "leads";
    expect(goalsOnEverySurface([campaign(data)], true)).toStrictEqual({
      weekly: expected,
      sharedTable: expected,
      sharedSummary: expected === "leads" ? "leads" : "not leads",
      internalReport: expected,
    });
  });
});

describe("facebookCampaignGoal", () => {
  const goalOf = (rows: Array<Record<string, unknown>>) =>
    facebookCampaignGoal(
      rows.reduce(addFacebookGoalRecord, emptyFacebookGoalInputs()),
      { leadsOnly: false },
    );

  it("sales wins when a campaign is stored as leads on some days", () => {
    expect(
      goalOf([
        { campaign_type: "lead", leads: 3 },
        { campaign_type: "ecommerce", purchases: 1 },
      ]),
    ).toBe("ecommerce");
  });

  it("an untyped campaign goes by its results", () => {
    expect(goalOf([{ purchases: 2, purchase_value: 90 }])).toBe("ecommerce");
    expect(goalOf([{ leads: 2 }])).toBe("leads");
  });

  it("facebookCampaignGoals classifies each key over all its rows", () => {
    const goals = facebookCampaignGoals(
      [
        { data: { campaign_name: "A", campaign_type: "lead" } },
        { data: { campaign_name: "B", campaign_type: "traffic" } },
        { data: { campaign_name: "A", campaign_objective: "OUTCOME_SALES" } },
      ],
      (data) => String(data.campaign_name),
      { leadsOnly: false },
    );
    expect(Object.fromEntries(goals)).toStrictEqual({
      A: "ecommerce",
      B: "traffic",
    });
  });
});
