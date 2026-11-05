/**
 * Recorded Meta Graph responses for the reconciliation tests (not imported by
 * any edge function), trimmed (AIO-238): an account in Israel time, two
 * campaign pages, an ad set optimised for a custom pixel event, and insights
 * across two pages with time_increment=1.
 */
import { type Recorded, replay } from "./test-fixtures.ts";
import type { ReconcileTable } from "./types.ts";

export const TOKEN = "EAABrecordedtokenrecordedtoken123";

export const recordedMetaTable: ReconcileTable = {
  id: "t-meta",
  tenant_id: "tenant-1",
  client_id: "client-1",
  integration_type: "facebook_insights",
  integration_settings: { ad_account_id: "1234" },
  last_sync_at: "2026-10-25T23:00:00Z",
};

const META_ACCOUNT = {
  account_id: "1234",
  name: "Client Ads",
  currency: "ILS",
  timezone_name: "Asia/Jerusalem",
  id: "act_1234",
};

const META_CAMPAIGNS_1 = {
  data: [
    {
      id: "111",
      name: "לידים | אתר",
      objective: "OUTCOME_LEADS",
      effective_status: "ACTIVE",
      configured_status: "ACTIVE",
      updated_time: "2026-10-01T10:00:00+0300",
    },
  ],
  paging: {
    next: `https://graph.facebook.com/v21.0/act_1234/campaigns?after=c1&access_token=${TOKEN}`,
  },
};

const META_CAMPAIGNS_2 = {
  data: [
    {
      id: "222",
      name: "מכירות",
      objective: "OUTCOME_SALES",
      effective_status: "ACTIVE",
      configured_status: "ACTIVE",
    },
  ],
};

const META_ADSETS = {
  data: [
    {
      id: "a1",
      campaign_id: "111",
      optimization_goal: "OFFSITE_CONVERSIONS",
      promoted_object: {
        pixel_id: "p1",
        custom_event_type: "OTHER",
        custom_conversion_id: undefined,
        custom_event_str: "NewLead",
      },
    },
  ],
};

const META_INSIGHTS_1 = {
  data: [
    insight("111", "2026-10-19", "120.50", [
      { action_type: "offsite_conversion.fb_pixel_custom.NewLead", value: "4" },
      { action_type: "offsite_conversion.fb_pixel_lead", value: "9" },
    ]),
  ],
  paging: {
    next: `https://graph.facebook.com/v21.0/act_1234/insights?after=i1&access_token=${TOKEN}`,
  },
};

const META_INSIGHTS_2 = {
  data: [
    insight(
      "222",
      "2026-10-25",
      "300",
      [{ action_type: "omni_purchase", value: "3" }],
      [{ action_type: "omni_purchase", value: "900" }],
    ),
  ],
};

/** The recorded account, campaigns, ad sets and insights, after any `extra` answers. */
export function metaRecording(extra: Recorded[] = []) {
  return replay([
    ...extra,
    { match: /\/act_1234\?/, body: META_ACCOUNT },
    { match: /\/campaigns\?(?!after)/, body: META_CAMPAIGNS_1 },
    { match: /\/campaigns\?after=c1/, body: META_CAMPAIGNS_2 },
    { match: /\/adsets\?/, body: META_ADSETS },
    { match: /\/insights\?(?!after)/, body: META_INSIGHTS_1 },
    { match: /\/insights\?after=i1/, body: META_INSIGHTS_2 },
  ]);
}

/** One campaign's insights for one day. */
function insight(
  campaign_id: string,
  date: string,
  spend: string,
  actions: Array<{ action_type: string; value: string }> = [],
  action_values: Array<{ action_type: string; value: string }> = [],
) {
  return {
    campaign_id,
    campaign_name: campaign_id === "111" ? "לידים | אתר" : "מכירות",
    date_start: date,
    date_stop: date,
    spend,
    impressions: "1000",
    clicks: "20",
    actions,
    action_values,
  };
}
