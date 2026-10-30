import {
  metaObjectiveGoal,
  type FacebookCampaignType,
} from "./meta-ads/campaign-objectives.ts";

// Shared Facebook Insights → CRM record logic.
//
// Both `sync-facebook-insights` (manual "sync now") and
// `cron-sync-facebook-insights` (the scheduled job that populates the report)
// MUST use this single implementation so their lead-counting can never drift
// again. They previously diverged: the manual function was fixed to recognise
// `offsite_conversion.fb_pixel_custom.*` custom conversions (e.g. "NewLead",
// "Lead_Bidul") while the cron kept an older matcher that only caught the legacy
// `offsite_conversion.custom.*` prefix — so website-lead campaigns optimised on a
// custom conversion were silently counted as 0 leads in the synced report.

import { ADS_LEVELS, type AdsEntityLevel } from "./ads-sync/levels.ts";

export interface CampaignStatus {
  id: string;
  name: string;
  effective_status: string;
  configured_status: string;
  objective?: string | null;
  updated_time?: string | null;
}

export interface InsightRecord {
  date: string;
  /** Granularity of this row — defaults to campaign for legacy rows. */
  entity_level?: AdsEntityLevel;
  campaign_id: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  link_clicks: number;
  conversations: number;
  video_views: number;
  post_engagements: number;
  results: number | null;
  result_kind: string | null;
  /** Hebrew label of the campaign's configured result (e.g. "התחלות תשלום"). */
  result_label: string | null;
  lp_or_form_views: number;
  cpm: number;
  ctr: number;
  leads: number;
  form_leads: number;
  cost_per_lead: number;
  spend: number;
  purchases: number;
  purchase_value: number;
  add_to_cart: number;
  roas: number;
  campaign_objective: string | null;
  optimization_goal: string | null;
  campaign_type: FacebookCampaignType;
  effective_status?: string | null;
  configured_status?: string | null;
  updated_time?: string | null;
}

// Field schema for the Facebook Insights CRM table (keys / Hebrew names / types),
// kept here so both sync functions create exactly the same columns.
export const FB_INSIGHTS_FIELD_KEYS = [
  "date",
  "campaign_name",
  "campaign_id",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "link_clicks",
  "conversations",
  "video_views",
  "post_engagements",
  "results",
  "result_kind",
  "lp_or_form_views",
  "cpm",
  "ctr",
  "leads",
  "form_leads",
  "cost_per_lead",
  "spend",
  "purchases",
  "purchase_value",
  "add_to_cart",
  "roas",
  "campaign_objective",
  "optimization_goal",
  "campaign_type",
  "effective_status",
  "configured_status",
  "updated_time",
  "result_label",
];
export const FB_INSIGHTS_FIELD_NAMES = [
  "תאריך",
  "שם הקמפיין",
  "מזהה קמפיין",
  "חשיפות",
  "תפוצה",
  "תדירות",
  "קליקים",
  "קליקים על קישור",
  "שיחות",
  "צפיות וידאו",
  "אינטראקציות",
  "תוצאות",
  "סוג תוצאה",
  "צפיות LP / פתיחות טופס",
  "עלות ל-1000 חשיפות",
  "אחוז קליקים",
  "לידים",
  "לידים מטופס",
  "עלות לליד",
  "הוצאה",
  "רכישות",
  "ערך רכישות",
  "הוספות לעגלה",
  "ROAS",
  "מטרת קמפיין",
  "אירוע אופטימיזציה",
  "סוג קמפיין",
  "סטטוס בפועל",
  "סטטוס מוגדר",
  "עדכון אחרון בקמפיין",
  "תווית תוצאה",
];
export const FB_INSIGHTS_FIELD_TYPES = [
  "date",
  "text",
  "text",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "text",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "number",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
];

/** Hebrew labels for each stored `result_kind`. Keep in sync with src/lib/facebookResultMetric.ts. */
export const RESULT_KIND_LABELS: Record<string, string> = {
  purchases: "רכישות",
  initiate_checkout: "התחלות תשלום",
  add_to_cart: "הוספות לעגלה",
  add_payment_info: "הוספת פרטי תשלום",
  view_content: "צפיות בתוכן",
  search: "חיפושים",
  leads: "לידים",
  conversations: "שיחות",
  video_views: "צפיות וידאו",
  engagements: "אינטראקציות",
  link_clicks: "קליקים על קישור",
  landing_page_views: "צפיות בדף נחיתה",
};

export interface CampaignResultMetric {
  kind: string;
  label: string;
  /** Equivalent action_types for the same event; the count is the MAX across them. */
  actionTypes: string[];
}

// Ecommerce pixel events a sales campaign can optimize for, keyed by
// promoted_object.custom_event_type. Meta reports one event under several
// action_types, so each list is treated as aliases (MAX, never SUM).
const ECOMMERCE_RESULT_EVENTS: Record<
  string,
  { kind: string; actionTypes: string[] }
> = {
  PURCHASE: {
    kind: "purchases",
    actionTypes: [
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "onsite_web_purchase",
      "purchase",
    ],
  },
  INITIATED_CHECKOUT: {
    kind: "initiate_checkout",
    actionTypes: [
      "omni_initiated_checkout",
      "offsite_conversion.fb_pixel_initiate_checkout",
      "onsite_web_initiate_checkout",
      "initiate_checkout",
    ],
  },
  ADD_TO_CART: {
    kind: "add_to_cart",
    actionTypes: [
      "omni_add_to_cart",
      "offsite_conversion.fb_pixel_add_to_cart",
      "onsite_web_add_to_cart",
      "add_to_cart",
    ],
  },
  ADD_PAYMENT_INFO: {
    kind: "add_payment_info",
    actionTypes: [
      "omni_add_payment_info",
      "offsite_conversion.fb_pixel_add_payment_info",
      "add_payment_info",
    ],
  },
  CONTENT_VIEW: {
    kind: "view_content",
    actionTypes: [
      "omni_view_content",
      "offsite_conversion.fb_pixel_view_content",
      "onsite_web_view_content",
      "view_content",
    ],
  },
  SEARCH: {
    kind: "search",
    actionTypes: [
      "omni_search",
      "offsite_conversion.fb_pixel_search",
      "search",
    ],
  },
};

/**
 * Resolve the ecommerce event a campaign/ad set is configured to optimize for.
 * Lead, messaging and custom-event results stay on the existing lead path.
 */
export function resolveCampaignResultMetric(
  promotedObject: any,
): CampaignResultMetric | null {
  const po = promotedObject || {};
  if (po.custom_conversion_id) return null;
  const cet = String(po.custom_event_type || "").toUpperCase();
  if (
    cet === "CONTENT_VIEW" &&
    (po.custom_event_str || extractPixelRuleEvent(po.pixel_rule))
  )
    return null;
  const event = ECOMMERCE_RESULT_EVENTS[cet];
  if (!event) return null;
  return {
    kind: event.kind,
    label: RESULT_KIND_LABELS[event.kind],
    actionTypes: event.actionTypes,
  };
}

export interface ResultMetricMaps {
  byCampaign: Record<string, CampaignResultMetric>;
  byAdset: Record<string, CampaignResultMetric>;
}

/** Map campaign and ad set ids to their configured ecommerce result metric. */
export function buildResultMetricMaps(
  adsets: Array<{
    id?: string | null;
    campaign_id?: string | null;
    promoted_object?: unknown;
  }>,
): ResultMetricMaps {
  const maps: ResultMetricMaps = { byCampaign: {}, byAdset: {} };
  for (const adset of adsets || []) {
    const metric = resolveCampaignResultMetric(adset?.promoted_object);
    if (!metric) continue;
    const adsetId = String(adset?.id || "");
    const campaignId = String(adset?.campaign_id || "");
    if (adsetId) maps.byAdset[adsetId] = metric;
    if (campaignId && !maps.byCampaign[campaignId])
      maps.byCampaign[campaignId] = metric;
  }
  return maps;
}

/** Pick the dominant ad-set optimization goal for each campaign. */
export function buildCampaignOptimizationGoalMap(
  adsets: Array<{
    campaign_id?: string | null;
    optimization_goal?: string | null;
  }>,
): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const adset of adsets) {
    const campaignId = String(adset.campaign_id || "");
    const goal = String(adset.optimization_goal || "")
      .trim()
      .toUpperCase();
    if (!campaignId || !goal) continue;
    const campaignCounts = counts.get(campaignId) || new Map<string, number>();
    campaignCounts.set(goal, (campaignCounts.get(goal) || 0) + 1);
    counts.set(campaignId, campaignCounts);
  }
  const result: Record<string, string> = {};
  for (const [campaignId, campaignCounts] of counts) {
    result[campaignId] = [...campaignCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0][0];
  }
  return result;
}

// Standard FB Pixel "intent" events that landing pages frequently use INSTEAD of
// the standard `Lead` event — each means "user submitted info / asked to be
// contacted / scheduled / subscribed". We treat them as leads.
export const STANDARD_INTENT_LEAD_TYPES = [
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "omni_complete_registration",
  "contact",
  "offsite_conversion.fb_pixel_contact",
  "submit_application",
  "offsite_conversion.fb_pixel_submit_application",
  "schedule",
  "offsite_conversion.fb_pixel_schedule",
  "subscribe",
  "offsite_conversion.fb_pixel_subscribe",
];

export const LEAD_ACTION_TYPES = [
  "lead", // Aggregate lead count
  "leadgen_grouped",
  "leadgen.other", // Facebook Lead Forms
  "offsite_conversion.fb_pixel_lead", // Landing page leads (standard pixel event)
  "onsite_conversion.lead_grouped", // On-site leads
  "app_custom_event.fb_mobile_lead", // App leads
  ...STANDARD_INTENT_LEAD_TYPES,
  // WhatsApp / Messaging conversions
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
  "messaging_first_reply",
  // Phone calls — Ads Manager "Calls" / "Per call placed"
  "click_to_call_native_call_placed",
  "onsite_conversion.messaging_user_call_placed",
  "click_to_call_native_20s_call_connect",
  "click_to_call_native_60s_call_connect",
];

/** Ad set goals whose Ads Manager Result is a phone call. */
export const CALL_OPTIMIZATION_GOALS = [
  "QUALITY_CALL",
  "MEANINGFUL_CALL_ATTEMPT",
] as const;

/**
 * Completed calls, highest priority first. Meta reports one call under several
 * action_types (placed, 20s, 60s). Take the first that fired — never sum them.
 * `click_to_call_native_call_placed` is the "Calls placed" / "Per call placed" column.
 */
export const CALL_PLACED_ACTION_PRIORITY = [
  "click_to_call_native_call_placed",
  "onsite_conversion.messaging_user_call_placed",
  "click_to_call_native_20s_call_connect",
  "click_to_call_native_60s_call_connect",
] as const;

/**
 * Clicks that start a call, not a connected call. Fallback only when Meta
 * omits a placed-call count (otherwise confirmation clicks inflate CPL).
 */
export const CALL_CLICK_FALLBACK_TYPES = [
  "onsite_conversion.click_to_call",
  "call_confirm_grouped",
  "click_to_call_call_confirm",
  "click_to_call_callback_request_submitted",
] as const;

export function isCallOptimizationGoal(
  goal: string | null | undefined,
): boolean {
  return (CALL_OPTIMIZATION_GOALS as readonly string[]).includes(
    String(goal || "").toUpperCase(),
  );
}

function isKnownCallActionType(type: string): boolean {
  return (
    (CALL_PLACED_ACTION_PRIORITY as readonly string[]).includes(type) ||
    (CALL_CLICK_FALLBACK_TYPES as readonly string[]).includes(type)
  );
}

/** First non-zero call result. Placed calls win over confirm-click fallbacks. */
export function countCallLeads(
  sumByTypes: (types: string[]) => number,
  options: { includeClickFallbacks?: boolean } = {},
): number {
  for (const type of CALL_PLACED_ACTION_PRIORITY) {
    const value = sumByTypes([type]);
    if (value > 0) return value;
  }
  if (!options.includeClickFallbacks) return 0;
  for (const type of CALL_CLICK_FALLBACK_TYPES) {
    const value = sumByTypes([type]);
    if (value > 0) return value;
  }
  return 0;
}

// Facebook returns the same conversion under multiple action_types (e.g.
// 'purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase' all refer
// to the same event). Summing all of them inflates 2-3x vs the Ads Manager UI,
// so we pick ONE canonical type per metric, with fallbacks.
const PURCHASE_ACTION_TYPE_PRIORITY = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
];
const ADD_TO_CART_ACTION_TYPE_PRIORITY = [
  "omni_add_to_cart",
  "offsite_conversion.fb_pixel_add_to_cart",
  "add_to_cart",
];

/**
 * Resolve the EXACT action_type(s) Facebook counts as a campaign's "Result",
 * from an ad set's `promoted_object` + `optimization_goal`. This is what makes
 * the report match Ads Manager: instead of guessing across all lead-ish events
 * (and picking the broad `fb_pixel_lead` over the campaign's real optimized
 * event), we count only the event the campaign is actually optimized for.
 *
 * Returns an array of equivalent action_types (count = MAX across them), or
 * null when it can't be determined (caller falls back to the heuristic).
 */
/** Extract a custom pixel event name from a promoted_object `pixel_rule` JSON
 *  string, e.g. {"event":{"eq":"NewLead"}} → "NewLead". Returns null if none. */
function extractPixelRuleEvent(pixelRule: any): string | null {
  if (!pixelRule) return null;
  try {
    const s =
      typeof pixelRule === "string" ? pixelRule : JSON.stringify(pixelRule);
    const m =
      s.match(/"event"\s*:\s*\{\s*"eq"\s*:\s*"([^"]+)"/) ||
      s.match(/"event"\s*:\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function resolveResultLeadTypes(
  promotedObject: any,
  optimizationGoal?: string | null,
  objective?: string | null,
): string[] | null {
  const po = promotedObject || {};
  const goal = String(optimizationGoal || "").toUpperCase();
  const obj = String(objective || "").toUpperCase();
  const cet = String(po.custom_event_type || "").toUpperCase();

  // Phone calls. Ads Manager's Result for these goals is "Calls" / "Per call
  // placed", even when the ad set also carries a pixel or page promoted_object.
  if (isCallOptimizationGoal(goal)) {
    return ["click_to_call_native_call_placed"];
  }

  // 1) Pixel Custom Conversion rule (optimized for a specific custom conversion).
  if (po.custom_conversion_id) {
    return ["offsite_conversion.fb_pixel_custom." + po.custom_conversion_id];
  }
  // 2) Custom pixel event (e.g. trackCustom('NewLead')) — the common case here.
  //    Meta exposes the event name either as `custom_event_str` or embedded in
  //    the `pixel_rule` JSON ({"event":{"eq":"NewLead"}}). Handle both.
  if (cet === "OTHER" || cet === "" || cet === "CONTENT_VIEW") {
    const name = po.custom_event_str || extractPixelRuleEvent(po.pixel_rule);
    if (name) return ["offsite_conversion.fb_pixel_custom." + name];
  }
  // 3) Standard pixel events, mapped to their insights action_type.
  const STD: Record<string, string[]> = {
    LEAD: ["offsite_conversion.fb_pixel_lead"],
    COMPLETE_REGISTRATION: [
      "offsite_conversion.fb_pixel_complete_registration",
      "complete_registration",
    ],
    CONTACT: ["offsite_conversion.fb_pixel_contact", "contact"],
    SCHEDULE: ["offsite_conversion.fb_pixel_schedule", "schedule"],
    SUBMIT_APPLICATION: [
      "offsite_conversion.fb_pixel_submit_application",
      "submit_application",
    ],
    SUBSCRIBE: ["offsite_conversion.fb_pixel_subscribe", "subscribe"],
  };
  if (STD[cet]) return STD[cet];
  // PURCHASE / sales optimization is not a lead — let the caller handle it.
  if (cet === "PURCHASE") return null;

  // 4) No pixel event: on-Facebook instant Lead Form.
  if (goal === "LEAD_GENERATION" || goal === "QUALITY_LEAD") {
    return [
      "leadgen_grouped",
      "leadgen.other",
      "onsite_conversion.lead_grouped",
    ];
  }
  // 5) Messaging / conversations.
  if (
    goal === "CONVERSATIONS" ||
    obj === "OUTCOME_ENGAGEMENT" ||
    obj === "MESSAGES"
  ) {
    return [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
    ];
  }
  return null;
}

/**
 * Build campaign_id → result action_type(s) map from a list of ad sets
 * (each `{ campaign_id, optimization_goal, promoted_object }`). Keeps the first
 * resolvable result per campaign. `campaignObjectives` supplies the campaign
 * objective as a fallback signal for the resolver.
 */
export function buildResultLeadTypeMap(
  adsets: any[],
  campaignObjectives: Record<string, string | null | undefined> = {},
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const as of adsets || []) {
    const cid = String(as?.campaign_id || "");
    if (!cid || map[cid]) continue;
    const types = resolveResultLeadTypes(
      as?.promoted_object,
      as?.optimization_goal,
      campaignObjectives[cid],
    );
    if (types && types.length > 0) map[cid] = types;
  }
  return map;
}

/**
 * Build a single CRM InsightRecord from one Facebook insights row (one
 * campaign × day). `campaignStatuses` maps campaign_id → status/objective.
 * `resultLeadTypesByCampaign` (optional) maps campaign_id → the exact result
 * action_type(s) from `buildResultLeadTypeMap`; when present for a campaign it
 * is authoritative and makes leads match Ads Manager's "Results" exactly.
 */
export function buildInsightRecord(
  insight: any,
  campaignStatuses: Record<string, CampaignStatus>,
  resultLeadTypesByCampaign: Record<string, string[]> = {},
  optimizationGoalsByCampaign: Record<string, string> = {},
  resultMetrics: ResultMetricMaps = { byCampaign: {}, byAdset: {} },
): InsightRecord {
  // Deduplicate: FB often returns the same event (e.g. leadgen_grouped,
  // offsite_conversion.fb_pixel_lead) in BOTH insight.actions AND
  // insight.conversions. Summing both arrays doubles the count. Instead, build
  // a map keyed by action_type and take the MAX value across both arrays so
  // each event is counted once, matching Ads Manager "Results".
  const _actionCountMap = new Map<string, number>();
  for (const a of [
    ...(insight.actions ?? []),
    ...(insight.conversions ?? []),
  ]) {
    const t = String(a.action_type || "");
    const v = parseInt(a.value) || 0;
    _actionCountMap.set(t, Math.max(_actionCountMap.get(t) ?? 0, v));
  }
  const allActions = Array.from(_actionCountMap.entries()).map(
    ([action_type, value]) => ({ action_type, value: String(value) }),
  );
  const actionValues = insight.action_values ?? [];
  const actionTypeSet = new Set(
    allActions.map((a: any) => String(a.action_type || "")),
  );

  const getActionCount = (actionTypes: string[]) =>
    allActions
      .filter((a: any) => actionTypes.includes(String(a.action_type || "")))
      .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);

  const getActionValue = (actionTypes: string[]) =>
    actionValues
      .filter((a: any) => actionTypes.includes(String(a.action_type || "")))
      .reduce((sum: number, a: any) => sum + (parseFloat(a.value) || 0), 0);

  // Lead counting — objective-aware, matches Facebook Ads Manager "Results".
  // CRITICAL: never sum aggregate `lead` with specific lead types — FB's `lead`
  // is itself an aggregate of leadgen + pixel + messaging, so that double counts.
  const sumByTypes = (types: string[]) =>
    allActions
      .filter((a: any) => types.includes(String(a.action_type || "")))
      .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);

  const _campaignStatusForLeads = campaignStatuses[insight.campaign_id];
  const _objectiveForLeads = String(
    _campaignStatusForLeads?.objective || "",
  ).toUpperCase();
  const _isLeadFormObjective =
    metaObjectiveGoal(_objectiveForLeads) === "leads";
  const _isMessagingObjective = ["OUTCOME_ENGAGEMENT", "MESSAGES"].includes(
    _objectiveForLeads,
  );
  const optimizationGoal =
    optimizationGoalsByCampaign[String(insight.campaign_id || "")] || null;
  const optimizationUpper = String(optimizationGoal || "").toUpperCase();
  const _callOptimized = isCallOptimizationGoal(optimizationUpper);

  // Use MAX across overlapping form-lead action types instead of SUM.
  // FB reports the same submission under both leadgen_grouped AND
  // onsite_conversion.lead_grouped (and sometimes leadgen.other), so summing
  // them double- or triple-counts vs the Ads Manager "Results" column.
  const _formLeadsValue = Math.max(
    sumByTypes(["leadgen_grouped"]),
    sumByTypes(["leadgen.other"]),
    sumByTypes(["onsite_conversion.lead_grouped"]),
  );
  const _messagingLeadsValue = Math.max(
    sumByTypes(["onsite_conversion.messaging_conversation_started_7d"]),
    sumByTypes(["messaging_conversation_started_7d"]),
  );
  const _pixelLeadsValue = sumByTypes(["offsite_conversion.fb_pixel_lead"]);
  // Custom Conversions on the Pixel.
  // FB returns BOTH a parent aggregate (`offsite_conversion.custom` or
  // `offsite_conversion.fb_pixel_custom` — exact match, no suffix) AND each child
  // custom conversion (e.g. `offsite_conversion.fb_pixel_custom.NewLead`). The
  // parent equals the sum of children, so we sum CHILDREN only to avoid double
  // counting. We accept both `offsite_conversion.custom.*` (legacy) and
  // `offsite_conversion.fb_pixel_custom.*` (current) prefixes. Fall back to the
  // PARENT aggregate when FB returns no children.
  const _customChildrenValue = allActions
    .filter((a: any) => {
      const t = String(a.action_type || "");
      return (
        t.startsWith("offsite_conversion.custom.") ||
        t.startsWith("offsite_conversion.fb_pixel_custom.")
      );
    })
    .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);
  const _customParentValue = sumByTypes([
    "offsite_conversion.fb_pixel_custom",
    "offsite_conversion.custom",
  ]);
  const _customConversionLeadsValue =
    _customChildrenValue > 0 ? _customChildrenValue : _customParentValue;
  // Standard intent events fired on landing pages (Complete Registration / etc.)
  const _standardIntentValue = sumByTypes(STANDARD_INTENT_LEAD_TYPES);

  // FB's aggregate `lead` action_type is the deduplicated total across all lead
  // sources (form + pixel + custom). Use it as a final fallback.
  const _aggregateLeadValue = sumByTypes(["lead"]);

  // Single-source leads — match Ads Manager per campaign; never sum form + pixel
  // for the same campaign. MAX across pixel signals because FB reports the same
  // conversion under multiple action_types (fb_pixel_lead AND a custom
  // conversion); summing would double count.
  //
  // OUTCOME_LEADS can optimise for EITHER a Facebook Lead Form OR website pixel
  // leads ("לידים מהאתר") — use whichever signal actually fired.
  const _websiteLeads = Math.max(
    _pixelLeadsValue,
    _customConversionLeadsValue,
    _standardIntentValue,
  );

  // AUTHORITATIVE PATH: when we know the exact event this campaign is optimized
  // for (from the ad set's promoted_object), count only that event — this is
  // what Facebook shows in the "Results" column. Avoids inflating by counting
  // the broad fb_pixel_lead, or by summing several custom events.
  // Only lock in authoritative when it actually finds leads > 0. If the resolved
  // event type gives 0 (e.g. an LP campaign whose ad set was classified as a form
  // campaign, or a custom event name that doesn't match the reported action type),
  // fall through to the heuristics so pixel/website leads are still captured.
  const _resultTypes =
    resultLeadTypesByCampaign[String(insight.campaign_id || "")];
  let leads = 0;
  let _leadsAuthoritative = false;
  if (_resultTypes && _resultTypes.length > 0) {
    const _authLeads = Math.max(0, ..._resultTypes.map((t) => sumByTypes([t])));
    if (_authLeads > 0) {
      leads = _authLeads;
      _leadsAuthoritative = true;
    }
  }
  if (!_leadsAuthoritative) {
    if (_isMessagingObjective) {
      leads = _messagingLeadsValue > 0 ? _messagingLeadsValue : _websiteLeads;
    } else if (_isLeadFormObjective) {
      // Prefer real form submissions; if the "Leads" campaign actually drives to a
      // website (pixel), use the pixel value instead of reporting 0.
      leads = _formLeadsValue > 0 ? _formLeadsValue : _websiteLeads;
    } else {
      // Conversions / Sales / Traffic with pixel — website leads.
      leads = _websiteLeads > 0 ? _websiteLeads : _formLeadsValue;
    }
  }

  // Phone calls are a lead. On a call-optimized campaign they ARE the Result
  // (Ads Manager "Calls" / "Per call placed") — a stray form or aggregate `lead`
  // must not replace them. Elsewhere, add placed calls on top of form/pixel
  // leads. Confirm-clicks are only a fallback when nothing else counted.
  const _callActionCounted =
    _leadsAuthoritative &&
    (_resultTypes || []).some((type) => isKnownCallActionType(type));
  const _callLeadsValue = countCallLeads(sumByTypes, {
    includeClickFallbacks: _callOptimized || leads === 0,
  });
  if (!_callActionCounted && _callLeadsValue > 0) {
    if (_callOptimized || leads === 0) leads = _callLeadsValue;
    else leads += _callLeadsValue;
  }
  // Aggregate `lead` does not include calls. Use it only when no lead signal fired.
  if (!_leadsAuthoritative && leads === 0) leads = _aggregateLeadValue;

  const _spendForLog = parseFloat(insight.spend) || 0;
  if (leads === 0 && _spendForLog > 0) {
    console.log("[fbInsights] ZERO leads despite spend", {
      campaign: insight.campaign_name,
      campaign_id: insight.campaign_id,
      date: insight.date_start,
      spend: _spendForLog,
      objective: _objectiveForLeads,
      action_types: Array.from(actionTypeSet),
    });
  }
  const _leadgenGroupedValue = _formLeadsValue;

  // Landing page views (website campaigns) vs form opens (Lead Form campaigns).
  const landingPageViews = allActions
    .filter((a: any) => String(a.action_type || "") === "landing_page_view")
    .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);
  const formOpens = allActions
    .filter((a: any) => {
      const type = String(a.action_type || "");
      return type === "leadgen_form_opened" || type === "lead_form_open";
    })
    .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);
  const leadFormLeads = allActions
    .filter((a: any) => String(a.action_type || "") === "leadgen_grouped")
    .reduce((sum: number, a: any) => sum + (parseInt(a.value) || 0), 0);
  const isLeadFormCampaign = leadFormLeads > 0 || formOpens > 0;
  const lpOrFormViews = isLeadFormCampaign ? formOpens : landingPageViews;

  // Cost per lead — always spend / leads for accuracy (matches FB aggregation).
  const spend = parseFloat(insight.spend) || 0;
  const costPerLead = leads > 0 ? spend / leads : 0;

  // Pick the first matching action_type (deduplicated) to mirror Ads Manager's
  // "Purchases" column instead of summing duplicate types.
  const pickFirstAvailable = (priority: string[]) => {
    for (const type of priority) {
      if (actionTypeSet.has(type)) return [type];
    }
    return [];
  };
  const effectivePurchaseTypes = pickFirstAvailable(
    PURCHASE_ACTION_TYPE_PRIORITY,
  );
  const effectiveAddToCartTypes = pickFirstAvailable(
    ADD_TO_CART_ACTION_TYPE_PRIORITY,
  );

  const purchases = getActionCount(effectivePurchaseTypes);
  const purchaseValue = getActionValue(effectivePurchaseTypes);
  const addToCart = getActionCount(effectiveAddToCartTypes);
  const roas = spend > 0 ? purchaseValue / spend : 0;

  const campaignStatus = campaignStatuses[insight.campaign_id];
  const objective = String(campaignStatus?.objective || "").toUpperCase();
  const isEcommerceObjective = metaObjectiveGoal(objective) === "ecommerce";
  const isLeadObjective = metaObjectiveGoal(objective) === "leads";
  const isMessagingObjective = ["OUTCOME_ENGAGEMENT", "MESSAGES"].includes(
    objective,
  );
  const isTrafficObjective = [
    "OUTCOME_TRAFFIC",
    "LINK_CLICKS",
    "TRAFFIC",
  ].includes(objective);

  const messagingActionTypes = [
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_first_reply",
    "messaging_first_reply",
  ];
  const hasMessagingSignal = messagingActionTypes.some((type) =>
    actionTypeSet.has(type),
  );
  const conversations = Math.max(
    0,
    ...messagingActionTypes.map((type) => sumByTypes([type])),
  );
  const videoViews = Math.max(
    sumByTypes(["video_view"]),
    sumByTypes(["video_thruplay_watched_actions"]),
  );
  const postEngagements = Math.max(
    sumByTypes(["post_engagement"]),
    sumByTypes(["page_engagement"]),
  );
  const linkClicks = Math.max(
    sumByTypes(["link_click"]),
    parseInt(insight.inline_link_clicks) || 0,
  );
  let results: number | null = null;
  let resultKind: string | null = null;
  if (optimizationUpper.includes("MESSAGE") || isMessagingObjective) {
    results = conversations;
    resultKind = "conversations";
  } else if (_callOptimized) {
    results = leads > 0 ? leads : null;
    resultKind = "leads";
  } else if (optimizationUpper.includes("THRUPLAY")) {
    results = videoViews;
    resultKind = "video_views";
  } else if (optimizationUpper.includes("VIDEO")) {
    results = videoViews;
    resultKind = "video_views";
  } else if (optimizationUpper.includes("ENGAGEMENT")) {
    results = postEngagements;
    resultKind = "engagements";
  } else if (
    optimizationUpper.includes("LINK_CLICK") ||
    optimizationUpper.includes("LANDING_PAGE") ||
    isTrafficObjective
  ) {
    results = optimizationUpper.includes("LANDING_PAGE")
      ? landingPageViews
      : linkClicks;
    resultKind = optimizationUpper.includes("LANDING_PAGE")
      ? "landing_page_views"
      : "link_clicks";
  } else if (
    isEcommerceObjective ||
    optimizationUpper.includes("PURCHASE") ||
    optimizationUpper.includes("VALUE")
  ) {
    results = purchases > 0 ? purchases : null;
    resultKind = "purchases";
  } else if (isLeadObjective || optimizationUpper.includes("LEAD")) {
    results = leads > 0 ? leads : null;
    resultKind = "leads";
  }

  // The ad set's configured event is the campaign's real "Result" in Ads Manager
  // (e.g. a sales campaign optimized for Initiate Checkout), so it wins over the
  // objective-based guess above.
  const configuredMetric =
    (insight.adset_id && resultMetrics.byAdset[String(insight.adset_id)]) ||
    resultMetrics.byCampaign[String(insight.campaign_id || "")];
  if (configuredMetric) {
    results = Math.max(
      0,
      ...configuredMetric.actionTypes.map((type: string) => sumByTypes([type])),
    );
    resultKind = configuredMetric.kind;
  }
  const resultLabel = resultKind
    ? configuredMetric?.label || RESULT_KIND_LABELS[resultKind] || null
    : null;

  const hasEcommerceSignal =
    purchases > 0 ||
    purchaseValue > 0 ||
    PURCHASE_ACTION_TYPE_PRIORITY.some((type) => actionTypeSet.has(type));
  // add_to_cart alone is NOT enough — lead campaigns can have incidental ATC.
  const hasStrongEcommerceSignal = hasEcommerceSignal || isEcommerceObjective;
  const hasLeadSignal =
    leads > 0 ||
    LEAD_ACTION_TYPES.some((type) => actionTypeSet.has(type)) ||
    Array.from(actionTypeSet).some(
      (type) =>
        String(type).startsWith("offsite_conversion.custom") ||
        String(type).startsWith("offsite_conversion.fb_pixel_custom"),
    );

  const campaignName = String(insight.campaign_name || "");
  const isMessagingLeadCampaign =
    isMessagingObjective ||
    hasMessagingSignal ||
    conversations > 0 ||
    optimizationUpper.includes("MESSAGE") ||
    optimizationUpper.includes("CONVERSATION") ||
    /whatsapp|ווטסאפ|וואטסאפ|מסנג|messenger|click.?to.?message/i.test(
      campaignName,
    );

  // A configured ecommerce event (Purchase, Initiate Checkout, …) or a sales
  // objective is the campaign type. Pixel leads or a stray conversation must
  // not push it into the leads table — those columns are shown alongside it.
  const configuredEcommerce =
    !!configuredMetric &&
    configuredMetric.kind in RESULT_KIND_LABELS &&
    ![
      "leads",
      "conversations",
      "video_views",
      "engagements",
      "link_clicks",
      "landing_page_views",
    ].includes(configuredMetric.kind);
  const campaignType: FacebookCampaignType =
    isEcommerceObjective || configuredEcommerce
      ? "ecommerce"
      : isTrafficObjective && !isMessagingLeadCampaign && !_callOptimized
        ? "traffic"
        : isLeadObjective || _callOptimized || isMessagingLeadCampaign
          ? "lead"
          : hasStrongEcommerceSignal &&
              !(hasLeadSignal && purchases === 0 && purchaseValue === 0)
            ? "ecommerce"
            : hasLeadSignal
              ? "lead"
              : addToCart > 0 ||
                  ADD_TO_CART_ACTION_TYPE_PRIORITY.some((type) =>
                    actionTypeSet.has(type),
                  )
                ? "ecommerce"
                : "other";

  const entityLevel: AdsEntityLevel = insight.ad_id
    ? "ad"
    : insight.adset_id
      ? "adset"
      : "campaign";

  return {
    date: insight.date_start,
    entity_level: entityLevel,
    campaign_id: insight.campaign_id,
    campaign_name: insight.campaign_name,
    adset_id: insight.adset_id || undefined,
    adset_name: insight.adset_name || undefined,
    ad_id: insight.ad_id || undefined,
    ad_name: insight.ad_name || undefined,
    impressions: parseInt(insight.impressions) || 0,
    reach: parseInt(insight.reach) || 0,
    frequency: parseFloat(insight.frequency) || 0,
    clicks: parseInt(insight.clicks) || 0,
    link_clicks: linkClicks,
    conversations,
    video_views: videoViews,
    post_engagements: postEngagements,
    results,
    result_kind: resultKind,
    result_label: resultLabel,
    lp_or_form_views: lpOrFormViews,
    cpm: parseFloat(insight.cpm) || 0,
    ctr: parseFloat(insight.ctr) || 0,
    leads,
    form_leads: _leadgenGroupedValue,
    cost_per_lead: costPerLead,
    spend: parseFloat(insight.spend) || 0,
    purchases,
    purchase_value: purchaseValue,
    add_to_cart: addToCart,
    roas,
    campaign_objective: campaignStatus?.objective || null,
    optimization_goal: optimizationGoal,
    campaign_type: campaignType,
    effective_status: campaignStatus?.effective_status || null,
    configured_status: campaignStatus?.configured_status || null,
    updated_time: campaignStatus?.updated_time || null,
  };
}

const FB_INSIGHTS_BASE_FIELDS =
  "impressions,reach,frequency,clicks,inline_link_clicks,cpm,ctr,actions,action_values,conversions,cost_per_action_type,cost_per_conversion,spend";

/** Paginate Facebook account insights for one hierarchy level. */
export async function fetchFacebookInsightsAtLevel(
  adAccountId: string,
  level: AdsEntityLevel,
  sinceStr: string,
  untilStr: string,
  accessToken: string,
): Promise<any[]> {
  const levelFields: Record<AdsEntityLevel, string> = {
    campaign: `campaign_id,campaign_name,${FB_INSIGHTS_BASE_FIELDS}`,
    adset: `campaign_id,campaign_name,adset_id,adset_name,${FB_INSIGHTS_BASE_FIELDS}`,
    ad: `campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,${FB_INSIGHTS_BASE_FIELDS}`,
  };
  const firstUrl =
    `https://graph.facebook.com/v21.0/${adAccountId}/insights?level=${level}` +
    `&fields=${levelFields[level]}` +
    `&time_range={"since":"${sinceStr}","until":"${untilStr}"}` +
    "&time_increment=1&use_unified_attribution_setting=true&limit=500" +
    `&access_token=${accessToken}`;

  const rows: any[] = [];
  let next: string | null = firstUrl;
  while (next) {
    const r = await fetch(next);
    const d: any = await r.json();
    if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
    if (Array.isArray(d.data)) rows.push(...d.data);
    next = d.paging?.next || null;
  }
  return rows;
}

/** Build CRM insight rows for campaign + ad set + ad levels (shared by manual + cron sync). */
export async function buildAllLevelInsightRecords(
  adAccountId: string,
  sinceStr: string,
  untilStr: string,
  accessToken: string,
  campaignStatuses: Record<string, CampaignStatus>,
  resultLeadTypesByCampaign: Record<string, string[]> = {},
  optimizationGoalsByCampaign: Record<string, string> = {},
  resultMetrics: ResultMetricMaps = { byCampaign: {}, byAdset: {} },
): Promise<{
  records: InsightRecord[];
  levelCounts: Record<AdsEntityLevel, number>;
  /** Levels whose fetch failed, with the error. A failed level contributes no rows. */
  levelErrors: Partial<Record<AdsEntityLevel, string>>;
}> {
  const allRows: InsightRecord[] = [];
  const levelCounts: Record<AdsEntityLevel, number> = {
    campaign: 0,
    adset: 0,
    ad: 0,
  };
  const levelErrors: Partial<Record<AdsEntityLevel, string>> = {};

  for (const level of ADS_LEVELS) {
    try {
      const raw = await fetchFacebookInsightsAtLevel(
        adAccountId,
        level,
        sinceStr,
        untilStr,
        accessToken,
      );
      for (const insight of raw) {
        allRows.push(
          buildInsightRecord(
            insight,
            campaignStatuses,
            resultLeadTypesByCampaign,
            optimizationGoalsByCampaign,
            resultMetrics,
          ),
        );
      }
      levelCounts[level] = raw.length;
      console.log(`[fbInsights] level=${level} rows=${raw.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      levelErrors[level] = message || "fetch failed";
      console.error(`[fbInsights] level=${level} fetch failed:`, message);
    }
  }

  return { records: allRows, levelCounts, levelErrors };
}

export type LastMetaActivity = {
  at: string | null;
  type: string | null;
  actor: string | null;
  object: string | null;
  availability: string;
  fetched_at?: string;
};

const META_ACTIVITY_OBJECTS = new Set(["CAMPAIGN", "AD_SET", "AD"]);

export function latestCampaignUpdatedTime(
  campaigns: Record<string, CampaignStatus> | CampaignStatus[] = {},
): string | null {
  const list = Array.isArray(campaigns) ? campaigns : Object.values(campaigns);
  const times = list
    .map((campaign) => campaign?.updated_time)
    .filter(Boolean) as string[];
  return times.sort().at(-1) || null;
}

export function cachedLastMetaActivity(
  settings: Record<string, unknown> | null | undefined,
): LastMetaActivity | null {
  const cached = settings?.last_meta_activity;
  if (!cached || typeof cached !== "object") return null;
  const activity = cached as LastMetaActivity;
  if (!activity.at && !activity.availability) return null;
  return activity;
}

/** Last campaign/ad-set/ad edit from Meta Ads Manager activities (not insights). */
export async function fetchLastMetaCampaignActivity(
  token: string | null,
  adAccountId: string | null,
): Promise<LastMetaActivity> {
  if (!adAccountId)
    return {
      at: null,
      type: null,
      actor: null,
      object: null,
      availability: "ad_account_not_connected",
    };
  if (!token)
    return {
      at: null,
      type: null,
      actor: null,
      object: null,
      availability: "meta_token_unavailable",
    };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const account = String(adAccountId).replace(/^act_/, "");
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const params = new URLSearchParams({
      fields:
        "event_time,date_time_in_timezone,event_type,translated_event_type,actor_name,object_id,object_name,object_type",
      add_children: "true",
      since,
      limit: "100",
      access_token: token,
    });
    const response = await fetch(
      `https://graph.facebook.com/v21.0/act_${account}/activities?${params}`,
      { signal: controller.signal },
    );
    const payload = await response.json();
    if (!response.ok || payload?.error || !Array.isArray(payload?.data)) {
      return {
        at: null,
        type: null,
        actor: null,
        object: null,
        availability: "meta_api_unavailable",
      };
    }
    const latest = payload.data
      .filter((activity: { object_type?: string }) =>
        META_ACTIVITY_OBJECTS.has(
          String(activity?.object_type || "").toUpperCase(),
        ),
      )
      .sort(
        (
          a: { event_time?: string; date_time_in_timezone?: string },
          b: { event_time?: string; date_time_in_timezone?: string },
        ) =>
          new Date(b.event_time || b.date_time_in_timezone || 0).getTime() -
          new Date(a.event_time || a.date_time_in_timezone || 0).getTime(),
      )[0];
    if (!latest)
      return {
        at: null,
        type: null,
        actor: null,
        object: null,
        availability: "no_campaign_change_in_30d",
      };
    return {
      at: latest.event_time || latest.date_time_in_timezone || null,
      type: latest.translated_event_type || latest.event_type || null,
      actor: latest.actor_name || null,
      object: latest.object_name || latest.object_id || null,
      availability: "available",
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return {
      at: null,
      type: null,
      actor: null,
      object: null,
      availability: "meta_api_unavailable",
    };
  } finally {
    clearTimeout(timer);
  }
}
