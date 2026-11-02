import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  FB_INSIGHTS_FIELD_KEYS,
  FB_INSIGHTS_FIELD_NAMES,
  FB_INSIGHTS_FIELD_TYPES,
  buildCampaignOptimizationGoalMap,
  buildInsightRecord,
  buildResultMetricMaps,
  latestCampaignUpdatedTime,
  resolveCampaignResultMetric,
  resolveResultLeadTypes,
} from "./fbInsights.ts";

const smartAirStatuses = {
  "120245057091170127": {
    id: "120245057091170127",
    name: "SmartAir - Genesis - מכירות",
    objective: "OUTCOME_SALES",
    effective_status: "ACTIVE",
    configured_status: "ACTIVE",
  },
  "120253026062570127": {
    id: "120253026062570127",
    name: "SmartAir - Genesis - שווקי חג המולד",
    objective: "OUTCOME_SALES",
    effective_status: "ACTIVE",
    configured_status: "ACTIVE",
  },
};
const smartAirAdsets = [
  {
    id: "as-checkout",
    campaign_id: "120245057091170127",
    optimization_goal: "OFFSITE_CONVERSIONS",
    promoted_object: { pixel_id: "p", custom_event_type: "INITIATED_CHECKOUT" },
  },
  {
    id: "as-purchase",
    campaign_id: "120253026062570127",
    optimization_goal: "OFFSITE_CONVERSIONS",
    promoted_object: { pixel_id: "p", custom_event_type: "PURCHASE" },
  },
];
const smartAirGoals = {
  "120245057091170127": "OFFSITE_CONVERSIONS",
  "120253026062570127": "OFFSITE_CONVERSIONS",
};

function smartAirRow(campaignId, actions, extra = {}) {
  return buildInsightRecord(
    {
      date_start: "2026-10-07",
      campaign_id: campaignId,
      campaign_name: smartAirStatuses[campaignId].name,
      spend: "629",
      actions,
      ...extra,
    },
    smartAirStatuses,
    {},
    smartAirGoals,
    buildResultMetricMaps(smartAirAdsets),
  );
}

Deno.test(
  "sales campaign optimized for Initiate Checkout reports checkouts as its result",
  () => {
    const row = smartAirRow("120245057091170127", [
      { action_type: "initiate_checkout", value: "3" },
      {
        action_type: "offsite_conversion.fb_pixel_initiate_checkout",
        value: "3",
      },
      { action_type: "onsite_web_initiate_checkout", value: "3" },
      { action_type: "omni_initiated_checkout", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "34" },
    ]);
    assertStrictEquals(row.campaign_type, "ecommerce");
    assertStrictEquals(row.result_kind, "initiate_checkout");
    assertStrictEquals(row.result_label, "התחלות תשלום");
    assertStrictEquals(row.results, 3);
    assertStrictEquals(row.purchases, 0);
    assertStrictEquals(row.leads, 34);
  },
);

Deno.test(
  "purchase-optimized campaign keeps purchases as result and does not borrow checkouts",
  () => {
    const row = smartAirRow("120253026062570127", [
      { action_type: "initiate_checkout", value: "1" },
      { action_type: "omni_initiated_checkout", value: "1" },
    ]);
    assertStrictEquals(row.result_kind, "purchases");
    assertStrictEquals(row.result_label, "רכישות");
    assertStrictEquals(row.results, 0);
    assertStrictEquals(row.purchases, 0);
  },
);

Deno.test(
  "purchase result counts onsite_web_purchase and stays deduplicated",
  () => {
    const row = smartAirRow("120253026062570127", [
      { action_type: "onsite_web_purchase", value: "1" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "1" },
    ]);
    assertStrictEquals(row.result_kind, "purchases");
    assertStrictEquals(row.results, 1);
  },
);

Deno.test("ad set rows use their own configured metric", () => {
  const row = smartAirRow(
    "120245057091170127",
    [{ action_type: "omni_initiated_checkout", value: "2" }],
    { adset_id: "as-checkout", adset_name: "Genesis checkout" },
  );
  assertStrictEquals(row.entity_level, "adset");
  assertStrictEquals(row.result_kind, "initiate_checkout");
  assertStrictEquals(row.results, 2);
});

Deno.test(
  "checkout campaign stays ecommerce when the objective lookup is missing",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-10-07",
        campaign_id: "120245057091170127",
        campaign_name: "SmartAir - Genesis - מכירות",
        spend: "629",
        actions: [
          { action_type: "omni_initiated_checkout", value: "3" },
          { action_type: "offsite_conversion.fb_pixel_lead", value: "34" },
        ],
      },
      {},
      {},
      { "120245057091170127": "OFFSITE_CONVERSIONS" },
      buildResultMetricMaps(smartAirAdsets),
    );
    assertStrictEquals(row.campaign_type, "ecommerce");
    assertStrictEquals(row.result_kind, "initiate_checkout");
    assertStrictEquals(row.results, 3);
    assertStrictEquals(row.leads, 34);
    assertStrictEquals(row.purchases, 0);
  },
);

Deno.test(
  "a conversation action does not pull an OUTCOME_SALES campaign into leads",
  () => {
    const row = smartAirRow("120245057091170127", [
      { action_type: "omni_initiated_checkout", value: "3" },
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: "2",
      },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "34" },
    ]);
    assertStrictEquals(row.campaign_type, "ecommerce");
    assertStrictEquals(row.result_kind, "initiate_checkout");
    assertStrictEquals(row.conversations, 2);
    assertStrictEquals(row.leads, 34);
  },
);

Deno.test(
  "lead and custom-event ad sets keep the existing lead result path",
  () => {
    assertStrictEquals(
      resolveCampaignResultMetric({ custom_event_type: "LEAD" }),
      null,
    );
    assertStrictEquals(
      resolveCampaignResultMetric({
        custom_event_type: "OTHER",
        custom_event_str: "NewLead",
      }),
      null,
    );
    assertStrictEquals(
      resolveCampaignResultMetric({ custom_conversion_id: "123" }),
      null,
    );
    assertStrictEquals(
      resolveCampaignResultMetric({ custom_event_type: "ADD_TO_CART" }).kind,
      "add_to_cart",
    );
  },
);

Deno.test("Facebook CRM field definitions stay aligned", () => {
  assertStrictEquals(
    FB_INSIGHTS_FIELD_KEYS.length,
    FB_INSIGHTS_FIELD_NAMES.length,
  );
  assertStrictEquals(
    FB_INSIGHTS_FIELD_KEYS.length,
    FB_INSIGHTS_FIELD_TYPES.length,
  );
});

Deno.test("dominant optimization goal is retained per campaign", () => {
  assertEquals(
    buildCampaignOptimizationGoalMap([
      { campaign_id: "c1", optimization_goal: "THRUPLAY" },
      { campaign_id: "c1", optimization_goal: "THRUPLAY" },
      { campaign_id: "c1", optimization_goal: "LINK_CLICKS" },
      { campaign_id: "c2", optimization_goal: null },
    ]),
    { c1: "THRUPLAY" },
  );
});

Deno.test(
  "messaging objective is synced as engagement with an exact conversation outcome",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-09-17",
        campaign_id: "c1",
        campaign_name: "Messages",
        spend: "50",
        impressions: "1000",
        reach: "800",
        frequency: "1.25",
        clicks: "30",
        actions: [
          {
            action_type: "onsite_conversion.messaging_conversation_started_7d",
            value: "8",
          },
          { action_type: "messaging_conversation_started_7d", value: "8" },
        ],
      },
      {
        c1: {
          id: "c1",
          name: "Messages",
          objective: "OUTCOME_ENGAGEMENT",
          effective_status: "ACTIVE",
          configured_status: "ACTIVE",
        },
      },
      {},
      { c1: "CONVERSATIONS" },
    );

    assertStrictEquals(row.campaign_type, "lead");
    assertStrictEquals(row.optimization_goal, "CONVERSATIONS");
    assertStrictEquals(row.result_kind, "conversations");
    assertStrictEquals(row.results, 8);
    assertStrictEquals(row.conversations, 8);
    assertStrictEquals(row.reach, 800);
    assertStrictEquals(row.frequency, 1.25);
  },
);

Deno.test("WhatsApp engagement campaign syncs as lead not traffic", () => {
  const row = buildInsightRecord(
    {
      date_start: "2026-09-17",
      campaign_id: "wa",
      campaign_name: "מעורבות | 18.8 - וואטסאפ",
      spend: "250",
      impressions: "8950",
      inline_link_clicks: "394",
      clicks: "394",
      actions: [
        { action_type: "link_click", value: "394" },
        {
          action_type: "onsite_conversion.messaging_conversation_started_7d",
          value: "12",
        },
      ],
    },
    {
      wa: {
        id: "wa",
        name: "מעורבות | 18.8 - וואטסאפ",
        objective: "OUTCOME_ENGAGEMENT",
        effective_status: "ACTIVE",
        configured_status: "ACTIVE",
      },
    },
    {},
    { wa: "LINK_CLICKS" },
  );

  assertStrictEquals(row.campaign_type, "lead");
  assertStrictEquals(row.conversations, 12);
});

Deno.test(
  "sales objective stores purchase results for pulse classification",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-09-17",
        campaign_id: "sale",
        campaign_name: "קמפיין מכירות | מבצעים ספטמבר",
        spend: "462.60",
        actions: [{ action_type: "omni_purchase", value: "2" }],
        action_values: [{ action_type: "omni_purchase", value: "1200" }],
      },
      {
        sale: {
          id: "sale",
          name: "קמפיין מכירות | מבצעים ספטמבר",
          objective: "OUTCOME_SALES",
          effective_status: "ACTIVE",
          configured_status: "ACTIVE",
        },
      },
      {},
      { sale: "OFFSITE_CONVERSIONS" },
    );

    assertStrictEquals(row.campaign_type, "ecommerce");
    assertStrictEquals(row.campaign_objective, "OUTCOME_SALES");
    assertStrictEquals(row.result_kind, "purchases");
    assertStrictEquals(row.purchases, 2);
  },
);

Deno.test("sales objective with incidental messaging stays ecommerce", () => {
  const row = buildInsightRecord(
    {
      date_start: "2026-10-05",
      campaign_id: "sale2",
      campaign_name: "יוני 26 | מכירות",
      spend: "203.13",
      actions: [
        { action_type: "omni_purchase", value: "4" },
        {
          action_type: "onsite_conversion.messaging_conversation_started_7d",
          value: "1",
        },
      ],
      action_values: [{ action_type: "omni_purchase", value: "900" }],
    },
    {
      sale2: {
        id: "sale2",
        name: "יוני 26 | מכירות",
        objective: "OUTCOME_SALES",
        effective_status: "ACTIVE",
        configured_status: "ACTIVE",
      },
    },
    {},
    { sale2: "OFFSITE_CONVERSIONS" },
  );

  assertStrictEquals(row.campaign_type, "ecommerce");
  assertStrictEquals(row.result_kind, "purchases");
});

const leadCampaign = (id, name, objective = "OUTCOME_LEADS") => ({
  [id]: {
    id,
    name,
    objective,
    effective_status: "ACTIVE",
    configured_status: "ACTIVE",
  },
});

Deno.test(
  "call-optimized campaign counts placed calls as leads, not confirm clicks",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-10-08",
        campaign_id: "us",
        campaign_name: "ארצות הברית | קמפיין שיחות",
        spend: "1014.03",
        impressions: "29939",
        clicks: "460",
        actions: [
          { action_type: "lead", value: "1" },
          { action_type: "click_to_call_native_call_placed", value: "44" },
          { action_type: "click_to_call_native_20s_call_connect", value: "20" },
          { action_type: "click_to_call_call_confirm", value: "60" },
        ],
      },
      leadCampaign("us", "ארצות הברית | קמפיין שיחות"),
      { us: ["click_to_call_native_call_placed"] },
      { us: "QUALITY_CALL" },
    );

    assertStrictEquals(row.leads, 44);
    assertStrictEquals(row.campaign_type, "lead");
    assertStrictEquals(row.result_kind, "leads");
    assertStrictEquals(row.results, 44);
    assert(Math.abs(row.cost_per_lead - 1014.03 / 44) < 0.001);
  },
);

Deno.test(
  "lead campaign with only call events counts those calls as leads",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-10-08",
        campaign_id: "cruise",
        campaign_name: "2027 קמפיין קרוז",
        spend: "521.72",
        impressions: "11435",
        clicks: "468",
        actions: [
          { action_type: "click_to_call_native_call_placed", value: "24" },
          { action_type: "click_to_call_call_confirm", value: "30" },
        ],
      },
      leadCampaign("cruise", "2027 קמפיין קרוז"),
    );

    assertStrictEquals(row.leads, 24);
    assertStrictEquals(row.campaign_type, "lead");
    assertStrictEquals(row.cost_per_lead, 521.72 / 24);
  },
);

Deno.test(
  "form lead campaign stays on form submissions when calls were not placed",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-10-08",
        campaign_id: "sport",
        campaign_name: "קמפיין נופש לידים - ספורט",
        spend: "699.90",
        impressions: "19358",
        clicks: "507",
        actions: [
          { action_type: "lead", value: "33" },
          { action_type: "leadgen_grouped", value: "33" },
          { action_type: "click_to_call_call_confirm", value: "10" },
        ],
      },
      leadCampaign("sport", "קמפיין נופש לידים - ספורט"),
      {
        sport: [
          "leadgen_grouped",
          "leadgen.other",
          "onsite_conversion.lead_grouped",
        ],
      },
      { sport: "LEAD_GENERATION" },
    );

    assertStrictEquals(row.leads, 33);
    assertStrictEquals(row.form_leads, 33);
  },
);

Deno.test(
  "placed calls are added to form leads when the campaign is not call-optimized",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-10-08",
        campaign_id: "mix",
        campaign_name: "לידים ושיחות",
        spend: "100",
        actions: [
          { action_type: "leadgen_grouped", value: "10" },
          { action_type: "click_to_call_native_call_placed", value: "4" },
          { action_type: "click_to_call_native_20s_call_connect", value: "2" },
        ],
      },
      leadCampaign("mix", "לידים ושיחות"),
      {},
      { mix: "LEAD_GENERATION" },
    );

    assertStrictEquals(row.leads, 14);
  },
);

Deno.test(
  "connected-call count is the fallback when placed calls are missing",
  () => {
    const row = buildInsightRecord(
      {
        date_start: "2026-10-08",
        campaign_id: "conn",
        campaign_name: "שיחות",
        spend: "80",
        actions: [
          { action_type: "click_to_call_native_20s_call_connect", value: "8" },
        ],
      },
      leadCampaign("conn", "שיחות"),
    );

    assertStrictEquals(row.leads, 8);
  },
);

Deno.test(
  "call optimization resolves to calls placed ahead of a pixel event",
  () => {
    assertEquals(
      resolveResultLeadTypes(
        { custom_event_type: "LEAD", pixel_id: "p1" },
        "QUALITY_CALL",
        "OUTCOME_LEADS",
      ),
      ["click_to_call_native_call_placed"],
    );
  },
);

Deno.test(
  "latest campaign updated_time is flushed from the campaign object",
  () => {
    assertStrictEquals(
      latestCampaignUpdatedTime({
        a: {
          id: "a",
          name: "A",
          effective_status: "ACTIVE",
          configured_status: "ACTIVE",
          updated_time: "2026-09-17T08:00:00+0000",
        },
        b: {
          id: "b",
          name: "B",
          effective_status: "ACTIVE",
          configured_status: "ACTIVE",
          updated_time: "2026-09-18T10:30:00+0000",
        },
      }),
      "2026-09-18T10:30:00+0000",
    );
  },
);
