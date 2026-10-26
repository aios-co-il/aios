import type { FbActionStat, FbInsightRow } from "./fbInsights.ts";
import { unknownField } from "./json-fields.ts";

export interface FbInsightsPage {
  rows: FbInsightRow[];
  next: string | null;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function readActionStats(value: unknown): FbActionStat[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => {
    const actionType = unknownField(item, "action_type");
    const statValue = unknownField(item, "value");
    return {
      action_type: typeof actionType === "string" ? actionType : undefined,
      value:
        typeof statValue === "string" || typeof statValue === "number"
          ? statValue
          : undefined,
    };
  });
}

export function readFbInsightRow(value: unknown): FbInsightRow {
  const field = (key: string) => unknownField(value, key);
  return {
    campaign_id: text(field("campaign_id")),
    campaign_name: text(field("campaign_name")),
    adset_id: optionalText(field("adset_id")),
    adset_name: optionalText(field("adset_name")),
    ad_id: optionalText(field("ad_id")),
    ad_name: optionalText(field("ad_name")),
    date_start: text(field("date_start")),
    spend: text(field("spend")),
    impressions: text(field("impressions")),
    reach: text(field("reach")),
    frequency: text(field("frequency")),
    clicks: text(field("clicks")),
    inline_link_clicks: text(field("inline_link_clicks")),
    cpm: text(field("cpm")),
    ctr: text(field("ctr")),
    actions: readActionStats(field("actions")),
    conversions: readActionStats(field("conversions")),
    action_values: readActionStats(field("action_values")),
  };
}

/** One Graph insights response page; throws the Graph error like the API reports it. */
export function readFbInsightsPage(body: unknown): FbInsightsPage {
  const error = unknownField(body, "error");
  if (error) {
    const message = unknownField(error, "message");
    throw new Error(message ? String(message) : JSON.stringify(error));
  }
  const data = unknownField(body, "data");
  const next = unknownField(unknownField(body, "paging"), "next");
  return {
    rows: Array.isArray(data) ? data.map(readFbInsightRow) : [],
    next: typeof next === "string" && next ? next : null,
  };
}
