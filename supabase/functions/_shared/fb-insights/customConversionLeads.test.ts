import { assertEquals } from "jsr:@std/assert@1";
import { buildInsightRecord } from "../fbInsights.ts";
import {
  customConversionLeads,
  fetchLeadCustomConversionIds,
} from "./customConversionLeads.ts";

// איימי בכור's custom conversions: a purchase and a lead conversion that both
// fire on the purchase thank-you page, plus an "other" page view.
const PURCHASE_CC = "2900123797019962";
const LEAD_CC = "1831441474549122";
const OTHER_CC = "931432588422527";
const LEAD_IDS = new Set([LEAD_CC]);

/** One day's actions: three purchases, each firing every thank-you conversion. */
const purchaseDay = [
  { action_type: `offsite_conversion.custom.${PURCHASE_CC}`, value: "3" },
  { action_type: `offsite_conversion.custom.${LEAD_CC}`, value: "3" },
  { action_type: `offsite_conversion.custom.${OTHER_CC}`, value: "3" },
  { action_type: "offsite_conversion.custom", value: "9" },
  { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
];

/** The leads the sync stores for a day of a campaign with this objective. */
function storedLeads(
  objective: string,
  leadIds: Set<string> | null,
  extraActions: Array<{ action_type: string; value: string }> = [],
) {
  const record = buildInsightRecord(
    {
      date_start: "2026-11-08",
      campaign_id: "c1",
      campaign_name: "קמפיין",
      impressions: "1000",
      clicks: "50",
      spend: "40",
      actions: [...purchaseDay, ...extraActions],
    },
    { c1: { id: "c1", name: "קמפיין", objective } },
    {},
    {},
    undefined,
    undefined,
    leadIds,
  );
  return record.leads;
}

Deno.test("customConversionLeads", async (t) => {
  await t.step("counts only lead, registration and contact conversions", () => {
    assertEquals(customConversionLeads(purchaseDay, LEAD_IDS), 3);
    assertEquals(customConversionLeads(purchaseDay, new Set()), 0);
  });

  await t.step("named custom pixel events keep counting", () => {
    const actions = [
      { action_type: "offsite_conversion.fb_pixel_custom.NewLead", value: "2" },
      ...purchaseDay,
    ];
    assertEquals(customConversionLeads(actions, new Set()), 2);
  });

  await t.step(
    "without the account's types, counts every child as before",
    () => {
      assertEquals(customConversionLeads(purchaseDay, null), 9);
      assertEquals(
        customConversionLeads(
          [{ action_type: "offsite_conversion.custom", value: "4" }],
          null,
        ),
        4,
      );
    },
  );
});

Deno.test("leads the sync stores from custom conversions", async (t) => {
  await t.step("a sales campaign does not count its purchases as leads", () => {
    // Was 9 a day: every thank-you conversion counted as a lead.
    assertEquals(storedLeads("OUTCOME_SALES", LEAD_IDS), 0);
  });

  await t.step("a sales campaign counts details left and messages", () => {
    const leads = storedLeads("OUTCOME_SALES", LEAD_IDS, [
      { action_type: "offsite_conversion.fb_pixel_lead", value: "1" },
      { action_type: "leadgen_grouped", value: "2" },
      {
        action_type: "onsite_conversion.messaging_conversation_started_7d",
        value: "4",
      },
      // Fires on the purchase page, so it is not a lead here.
      {
        action_type: "offsite_conversion.fb_pixel_complete_registration",
        value: "3",
      },
    ]);
    assertEquals(leads, 6);
  });

  await t.step(
    "a traffic campaign does not count thank-you conversions",
    () => {
      // Aimee's Instagram traffic campaign: the "ליד" conversion fires on the
      // course purchase page, so its buyers were counted as leads.
      assertEquals(storedLeads("OUTCOME_TRAFFIC", LEAD_IDS), 0);
      assertEquals(
        storedLeads("OUTCOME_TRAFFIC", LEAD_IDS, [
          {
            action_type: "onsite_conversion.messaging_conversation_started_7d",
            value: "2",
          },
        ]),
        2,
      );
    },
  );

  await t.step("a traffic campaign skips the aggregate lead fallback", () => {
    assertEquals(
      storedLeads("OUTCOME_TRAFFIC", LEAD_IDS, [
        { action_type: "lead", value: "3" },
      ]),
      0,
    );
  });

  await t.step("a traffic campaign counts a first reply as a message", () => {
    assertEquals(
      storedLeads("OUTCOME_TRAFFIC", LEAD_IDS, [
        { action_type: "onsite_conversion.messaging_first_reply", value: "2" },
      ]),
      2,
    );
  });

  await t.step("a lead campaign still counts its lead conversion", () => {
    assertEquals(storedLeads("OUTCOME_LEADS", LEAD_IDS), 3);
  });
});

Deno.test("fetchLeadCustomConversionIds", async (t) => {
  const realFetch = globalThis.fetch;
  /** Run the read against a stubbed Graph response, restoring fetch after. */
  async function readWith(body: unknown) {
    globalThis.fetch = () =>
      Promise.resolve(new Response(JSON.stringify(body)));
    try {
      return await fetchLeadCustomConversionIds("act_1", "token");
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  await t.step("keeps the lead, registration and contact ids", async () => {
    const ids = await readWith({
      data: [
        { id: PURCHASE_CC, custom_event_type: "PURCHASE" },
        { id: LEAD_CC, custom_event_type: "LEAD" },
        { id: "r1", custom_event_type: "COMPLETE_REGISTRATION" },
        { id: "c1", custom_event_type: "CONTACT" },
        { id: OTHER_CC, custom_event_type: "OTHER" },
      ],
    });
    assertEquals(ids, new Set([LEAD_CC, "r1", "c1"]));
  });

  await t.step("a refused read returns null", async () => {
    assertEquals(
      await readWith({ error: { message: "(#200) Permissions error" } }),
      null,
    );
  });
});
