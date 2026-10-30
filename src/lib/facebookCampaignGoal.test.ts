import { describe, expect, it } from "vitest";
import { groupFacebookReportCampaigns } from "@/components/dynamic-tables/facebookReportCampaigns";
import { summarizeSharedTableRecords } from "@/components/SharedTable/sharedTableSummary";
import {
  REPORT_CAMPAIGN_GOALS,
  type ReportCampaignGoal,
} from "./campaignGoals";
import {
  addFacebookGoalRecord,
  emptyFacebookGoalInputs,
  facebookCampaignGoal,
  facebookCampaignGoals,
} from "./facebookCampaignGoal";
import {
  facebookRecordGoalOf,
  groupFacebookRowsByGoal,
} from "./facebookGoalGroups";
import { buildWeeklyCampaignSections } from "./weeklyAdsComparison";
import { weeklySourceModesForTable } from "./weeklyCampaignGoals";

const NOW = new Date("2026-09-18T12:00:00Z");
const GOALS = REPORT_CAMPAIGN_GOALS;

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
const cases: Array<[string, Record<string, unknown>, ReportCampaignGoal]> = [
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
  [
    "a legacy sync row with conversions and no purchases",
    { conversions: 4, cost: 50 },
    "leads",
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
  // The shared report and both dashboards' mixed tables group the same way.
  const shared = groupFacebookRowsByGoal(records, "campaign", { leadsOnly });
  const internal = groupFacebookReportCampaigns(records, "campaign", {
    leadsOnly,
  });
  const summary = summarizeSharedTableRecords(records, {
    integrationType: "facebook_insights",
    goalOf: shared.goalOf,
    goals: {
      hasEcommerce: shared.ecommerce.length > 0,
      hasLeads: shared.leads.length > 0,
    },
  });
  return {
    weekly: week.rows[0].kind,
    sharedAndDashboardTables: GOALS.find((goal) => shared[goal].length > 0),
    sharedSummary: summary.leads > 0 ? "leads" : "not leads",
    internalReport: GOALS.find((goal) => internal[goal].length > 0),
  };
}

/** The goals the dashboards' KPIs give each record of a mixed table. */
function dashboardKpiGoals(records: Array<ReturnType<typeof campaign>>) {
  const goalOf = facebookRecordGoalOf(records, "campaign", {
    leadsOnly: false,
  });
  return records.map((record) => goalOf(record.data));
}

describe("facebookCampaignGoal on every report surface", () => {
  it.each(cases)("%s gets the same goal everywhere", (_, data, goal) => {
    expect(goalsOnEverySurface([campaign(data)], false)).toStrictEqual({
      weekly: goal,
      sharedAndDashboardTables: goal,
      sharedSummary: goal === "leads" ? "leads" : "not leads",
      internalReport: goal,
    });
    expect(dashboardKpiGoals([campaign(data)])).toStrictEqual([goal]);
  });

  it("a legacy CONVERSIONS sales campaign with a leads-only day stays in sales", () => {
    const records = [
      campaign({
        campaign_type: "ecommerce",
        campaign_objective: "CONVERSIONS",
        purchases: 2,
        purchase_value: 300,
      }),
      campaign({
        date: "2026-09-15",
        campaign_type: "lead",
        campaign_objective: "CONVERSIONS",
        leads: 3,
      }),
    ];
    expect(goalsOnEverySurface(records, false)).toStrictEqual({
      weekly: "ecommerce",
      sharedAndDashboardTables: "ecommerce",
      sharedSummary: "not leads",
      internalReport: "ecommerce",
    });
    // Each day counts toward the campaign's goal, not the goal it shows alone.
    expect(dashboardKpiGoals(records)).toStrictEqual([
      "ecommerce",
      "ecommerce",
    ]);
  });

  it.each(cases)("%s in a leads-only table", (_, data, goal) => {
    const expected = goal === "traffic" ? "traffic" : "leads";
    expect(goalsOnEverySurface([campaign(data)], true)).toStrictEqual({
      weekly: expected,
      sharedAndDashboardTables: expected,
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

  it("pixel noise does not make a lead campaign a sales campaign", () => {
    expect(goalOf([{ form_leads: 5, add_to_cart: 3 }])).toBe("leads");
    expect(
      goalOf([
        {
          campaign_objective: "OUTCOME_LEADS",
          purchases: 1,
          purchase_value: 90,
        },
      ]),
    ).toBe("leads");
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

describe("a campaign's Meta setup decides its table, not each day's stored type", () => {
  // Shapes from production: the sync stores each day's campaign_type from
  // that day's results, so one campaign can hold several types.
  const days = (
    setup: Record<string, unknown>,
    stored: Array<Record<string, unknown>>,
  ) =>
    stored.map((day, index) => ({
      data: {
        campaign_id: "C",
        campaign_name: "C",
        spend: 100,
        date: `2026-09-1${index}`,
        ...setup,
        ...day,
      },
    }));
  const goalOf = (records: Array<{ data: Record<string, unknown> }>) =>
    facebookCampaignGoals(records, () => "C", { leadsOnly: false }).get("C");

  it.each<
    [
      string,
      Record<string, unknown>,
      Array<Record<string, unknown>>,
      ReportCampaignGoal,
    ]
  >([
    [
      "a reach campaign with a stray purchase day",
      { campaign_objective: "OUTCOME_AWARENESS", optimization_goal: "REACH" },
      [
        { campaign_type: "ecommerce", purchases: 1 },
        { campaign_type: "other" },
      ],
      "traffic",
    ],
    [
      "a video-views campaign stored as sales, leads and other",
      {
        campaign_objective: "OUTCOME_AWARENESS",
        optimization_goal: "THRUPLAY",
      },
      [
        { campaign_type: "ecommerce", purchases: 2 },
        { campaign_type: "lead", conversations: 1 },
        { campaign_type: "other" },
      ],
      "traffic",
    ],
    [
      "a profile-visit traffic campaign with lead days",
      {
        campaign_objective: "OUTCOME_TRAFFIC",
        optimization_goal: "PROFILE_VISIT",
      },
      [
        { campaign_type: "lead", leads: 6 },
        { campaign_type: "traffic", leads: 4 },
      ],
      "traffic",
    ],
    [
      "a traffic campaign named for WhatsApp",
      { campaign_objective: "OUTCOME_TRAFFIC", campaign_name: "קמפיין ווטסאפ" },
      [{ campaign_type: "traffic", leads: 3 }],
      "leads",
    ],
    [
      "an engagement campaign optimized for conversations",
      {
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "CONVERSATIONS",
      },
      [
        { campaign_type: "lead", leads: 30 },
        { campaign_type: "lead", optimization_goal: null },
      ],
      "leads",
    ],
    [
      "an engagement campaign optimized for video views",
      {
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "THRUPLAY",
      },
      [{ campaign_type: "lead" }],
      "traffic",
    ],
    [
      "an engagement campaign for profile and page (followers)",
      {
        campaign_objective: "OUTCOME_ENGAGEMENT",
        optimization_goal: "PROFILE_AND_PAGE_ENGAGEMENT",
      },
      [{ campaign_type: "lead", leads: 3 }],
      "traffic",
    ],
    [
      "an engagement campaign whose rows lack the optimization goal",
      { campaign_objective: "OUTCOME_ENGAGEMENT" },
      [{ campaign_type: "lead", leads: 4 }],
      "leads",
    ],
    [
      "a sales campaign with lead days",
      { campaign_objective: "OUTCOME_SALES" },
      [
        { campaign_type: "lead", leads: 1 },
        { campaign_type: "ecommerce", purchases: 3 },
      ],
      "ecommerce",
    ],
  ])("%s", (_name, setup, stored, goal) => {
    expect(goalOf(days(setup, stored))).toBe(goal);
  });
});
