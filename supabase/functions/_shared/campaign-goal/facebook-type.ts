import {
  metaObjectiveGoal,
  type FacebookCampaignType,
} from "../meta-ads/campaign-objectives.ts";
import type { AdsMetricData } from "./ads-metrics.ts";
import {
  facebookObjectiveKind,
  isFacebookMessagingLeadRecord,
} from "./facebook-objective.ts";

type NullableAdsMetricData = AdsMetricData | null | undefined;

/** Result kinds that belong on the ecommerce table, next to leads when both fire. */
export const FACEBOOK_ECOMMERCE_RESULT_KINDS = new Set([
  "purchases",
  "initiate_checkout",
  "add_to_cart",
  "add_payment_info",
  "view_content",
  "search",
]);

const FACEBOOK_CAMPAIGN_TYPE_RANK: Record<string, number> = {
  ecommerce: 3,
  lead: 2,
  traffic: 1,
  other: 0,
};

/** Same campaign can be labeled lead on some days and ecommerce on others. Sales wins. */
export function preferFacebookCampaignType(
  current: string | undefined,
  next: string | undefined,
): FacebookCampaignType {
  const cur = String(current || "other").toLowerCase();
  const nxt = String(next || "other").toLowerCase();
  const winner =
    (FACEBOOK_CAMPAIGN_TYPE_RANK[nxt] ?? 0) >
    (FACEBOOK_CAMPAIGN_TYPE_RANK[cur] ?? 0)
      ? nxt
      : cur;
  if (winner === "ecommerce" || winner === "lead" || winner === "traffic") {
    return winner;
  }
  return "other";
}

/** The fields of a Facebook campaign that decide whether it is a sales campaign. */
export type FacebookSalesSignals = {
  campaign_type?: string;
  campaign_objective?: string | null;
  result_kind?: string | null;
  result?: { result_kind?: string | null } | null;
  leads: number;
  purchases: number;
  purchase_value: number;
};

/**
 * Whether a Facebook campaign (a row or a campaign's totals) is a sales campaign.
 * An explicit sales campaign stays ecommerce when the pixel also fires leads
 * and purchases are still zero, so the report can show both on one row.
 */
export function isFacebookEcommerceCampaign(
  data: FacebookSalesSignals,
): boolean {
  const rowType = String(data.campaign_type || "").toLowerCase();
  if (rowType === "traffic") {
    return false;
  }
  if (rowType === "ecommerce") {
    return true;
  }
  if (metaObjectiveGoal(data.campaign_objective) === "ecommerce") {
    return true;
  }
  const resultKind = String(
    data.result_kind || data.result?.result_kind || "",
  ).toLowerCase();
  if (FACEBOOK_ECOMMERCE_RESULT_KINDS.has(resultKind)) {
    return true;
  }
  // A lead campaign stays a lead campaign even when the pixel reports a stray purchase.
  if (rowType === "lead") {
    return false;
  }
  return (
    (data.purchases > 0 || data.purchase_value > 0) &&
    !(data.leads > 0 && data.purchases === 0 && data.purchase_value === 0)
  );
}

/**
 * A campaign's type while its rows are added: the first type its Meta setup
 * decides wins; until one does, the strongest stored type.
 */
export function addFacebookCampaignTypeRow(
  current: {
    configured: FacebookCampaignType | null;
    stored: FacebookCampaignType;
  },
  data: NullableAdsMetricData,
): { configured: FacebookCampaignType | null; stored: FacebookCampaignType } {
  return {
    configured: current.configured ?? facebookObjectiveKind(data),
    stored: preferFacebookCampaignType(
      current.stored,
      effectiveFacebookCampaignType(data),
    ),
  };
}

/**
 * The Meta objective decides when it is known (stored campaign_type may be stale or
 * mislabeled by older syncs). Otherwise: stored rows may still say traffic until the
 * next Meta sync — WhatsApp/messaging belongs in leads.
 */
export function effectiveFacebookCampaignType(
  data: NullableAdsMetricData,
): FacebookCampaignType {
  const byObjective = facebookObjectiveKind(data);
  if (byObjective) {
    return byObjective;
  }
  const rowType = String(data?.campaign_type || "").toLowerCase();
  if (rowType === "traffic" && isFacebookMessagingLeadRecord(data)) {
    return "lead";
  }
  if (rowType === "ecommerce" || rowType === "lead" || rowType === "traffic") {
    return rowType;
  }
  return "other";
}

/** A Facebook report table set to leads only keeps every non-traffic campaign in leads. */
export function isFacebookLeadsOnlyTable(
  integrationSettings?: Record<string, unknown> | null,
): boolean {
  const t = String(integrationSettings?.campaign_type || "").toLowerCase();
  return t === "leads" || t === "lead";
}
