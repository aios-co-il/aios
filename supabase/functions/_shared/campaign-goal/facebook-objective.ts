import { metaObjectiveGoal } from "../meta-ads/campaign-objectives.ts";
import {
  getMessagingLeadsFromData,
  type AdsMetricData,
} from "./ads-metrics.ts";

type NullableAdsMetricData = AdsMetricData | null | undefined;

export function isFacebookMessagingLeadRecord(
  data: NullableAdsMetricData,
): boolean {
  const name = String(
    data?.campaign_name || data?.campaign || data?.name || "",
  );
  if (/whatsapp|ווטסאפ|וואטסאפ|מסנג|messenger|click.?to.?message/i.test(name)) {
    return true;
  }
  const optimization = String(data?.optimization_goal || "").toUpperCase();
  if (/MESSAGE|CONVERSATION|WHATSAPP|MESSENGER/.test(optimization)) {
    return true;
  }
  const resultKind = String(data?.result_kind || "").toLowerCase();
  if (
    ["conversations", "messages", "messaging_conversations"].includes(
      resultKind,
    )
  ) {
    return true;
  }
  const objective = String(
    data?.campaign_objective || data?.objective || "",
  ).toUpperCase();
  if (
    /OUTCOME_ENGAGEMENT|MESSAGES/.test(objective) &&
    getMessagingLeadsFromData(data) > 0
  ) {
    return true;
  }
  if (
    /OUTCOME_ENGAGEMENT|MESSAGES/.test(objective) &&
    /whatsapp|ווטסאפ|וואטסאפ/i.test(name)
  ) {
    return true;
  }
  return false;
}

/** Objectives that buy exposure (reach, video views): their table is traffic. */
const FACEBOOK_AWARENESS_OBJECTIVES: ReadonlySet<string> = new Set([
  "OUTCOME_AWARENESS",
  "REACH",
  "BRAND_AWARENESS",
  "VIDEO_VIEWS",
]);
const FACEBOOK_TRAFFIC_OBJECTIVES: ReadonlySet<string> = new Set([
  "OUTCOME_TRAFFIC",
  "LINK_CLICKS",
]);
const FACEBOOK_ENGAGEMENT_OBJECTIVES: ReadonlySet<string> = new Set([
  "OUTCOME_ENGAGEMENT",
  "POST_ENGAGEMENT",
  "PAGE_LIKES",
  "MESSAGES",
]);

/**
 * A messaging or call campaign by how it is set up in Meta (its name or
 * optimization goal), not by one day's results.
 */
function isFacebookMessagingByConfig(data: NullableAdsMetricData): boolean {
  const name = String(
    data?.campaign_name || data?.campaign || data?.name || "",
  );
  if (/whatsapp|ווטסאפ|וואטסאפ|מסנג|messenger|click.?to.?message/i.test(name)) {
    return true;
  }
  const optimization = String(data?.optimization_goal || "").toUpperCase();
  return /MESSAGE|CONVERSATION|WHATSAPP|MESSENGER|CALL/.test(optimization);
}

/**
 * The report kind a campaign's Meta setup decides; null when it does not.
 * The objective and optimization goal are the same on every row of a
 * campaign, unlike the stored campaign_type, which the sync sets from each
 * day's results. Sales and lead objectives decide on their own; exposure
 * objectives are traffic; traffic and engagement are leads only for a
 * messaging or call campaign, and engagement needs its optimization goal.
 */
export function facebookObjectiveKind(
  data: NullableAdsMetricData,
): "lead" | "ecommerce" | "traffic" | null {
  const objective = String(
    data?.campaign_objective || data?.objective || "",
  ).toUpperCase();
  // Sales campaigns stay ecommerce; their leads/conversations show on the same row.
  const goal = metaObjectiveGoal(objective);
  if (goal) {
    return goal === "leads" ? "lead" : goal;
  }
  if (FACEBOOK_AWARENESS_OBJECTIVES.has(objective)) {
    return "traffic";
  }
  if (FACEBOOK_TRAFFIC_OBJECTIVES.has(objective)) {
    return isFacebookMessagingByConfig(data) ? "lead" : "traffic";
  }
  if (FACEBOOK_ENGAGEMENT_OBJECTIVES.has(objective)) {
    if (isFacebookMessagingByConfig(data)) {
      return "lead";
    }
    return data?.optimization_goal ? "traffic" : null;
  }
  return null;
}
