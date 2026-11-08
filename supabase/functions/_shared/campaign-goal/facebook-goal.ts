import type { FacebookCampaignType } from "../meta-ads/campaign-objectives.ts";
import { getLeadsFromData } from "./ads-metrics.ts";
import {
  addFacebookCampaignTypeRow,
  isFacebookEcommerceCampaign,
} from "./facebook-type.ts";
import type { ReportCampaignGoal } from "./report-goals.ts";

type RecordData = Record<string, unknown>;

/** What decides a Facebook campaign's goal, gathered over its stored rows. */
export type FacebookGoalInputs = {
  /**
   * The type the campaign's Meta setup decides (objective, optimization goal),
   * else the strongest stored type across the rows: sales, then leads, then
   * traffic. The sync stores each day's type from that day's results.
   */
  campaignType: FacebookCampaignType;
  /** The type the Meta setup decides, from the first row that tells it. */
  configuredType: FacebookCampaignType | null;
  /** The strongest stored type across the rows. */
  storedType: FacebookCampaignType;
  objective: string | null;
  resultKind: string | null;
  leads: number;
  purchases: number;
  revenue: number;
};

/**
 * Leads a traffic, engagement or awareness campaign must measure over the rows
 * judged before it counts as a lead campaign. While it measures leads it shows
 * and alerts on leads, with its clicks still on its row (David, AIO-514, as
 * Google's AIO-496 rule); fewer are stray pixel leads, so it stays traffic.
 */
export const TRAFFIC_CAMPAIGN_MIN_LEADS = 5;

/**
 * Goal of one Facebook campaign in every campaign report: the internal report,
 * the shared report and its KPIs, the weekly tab, the dashboards' mixed
 * tables and KPIs (groupFacebookRowsByGoal), and the pulse. Traffic stays
 * traffic unless it measures at least TRAFFIC_CAMPAIGN_MIN_LEADS leads, a
 * leads-only table keeps everything else in leads, and otherwise the stored
 * type, the Meta objective, the configured result and the results decide.
 */
export function facebookCampaignGoal(
  inputs: FacebookGoalInputs,
  options: { leadsOnly: boolean },
): ReportCampaignGoal {
  if (inputs.campaignType === "traffic") {
    return inputs.leads >= TRAFFIC_CAMPAIGN_MIN_LEADS ? "leads" : "traffic";
  }
  if (options.leadsOnly) {
    return "leads";
  }
  const isSales = isFacebookEcommerceCampaign({
    leads: inputs.leads,
    purchases: inputs.purchases,
    purchase_value: inputs.revenue,
    campaign_type: inputs.campaignType,
    campaign_objective: inputs.objective,
    result_kind: inputs.resultKind,
  });
  return isSales ? "ecommerce" : "leads";
}

/** Goal of each campaign over its records, keyed the way the caller groups rows. */
export function facebookCampaignGoals(
  records: Array<{ data?: RecordData | null }>,
  keyOf: (data: RecordData) => string,
  options: { leadsOnly: boolean },
): Map<string, ReportCampaignGoal> {
  const inputsByKey = new Map<string, FacebookGoalInputs>();
  for (const record of records) {
    const data = record.data ?? {};
    const key = keyOf(data);
    const inputs = inputsByKey.get(key) ?? emptyFacebookGoalInputs();
    inputsByKey.set(key, addFacebookGoalRecord(inputs, data));
  }
  const goals = new Map<string, ReportCampaignGoal>();
  for (const [key, inputs] of inputsByKey) {
    goals.set(key, facebookCampaignGoal(inputs, options));
  }
  return goals;
}

/** Goal inputs of a campaign before any of its rows are added. */
export function emptyFacebookGoalInputs(): FacebookGoalInputs {
  return {
    campaignType: "other",
    configuredType: null,
    storedType: "other",
    objective: null,
    resultKind: null,
    leads: 0,
    purchases: 0,
    revenue: 0,
  };
}

/**
 * Adds one stored row to a campaign's goal inputs. The first objective and
 * result kind win; the counts use the internal report's fields.
 */
export function addFacebookGoalRecord(
  inputs: FacebookGoalInputs,
  data: RecordData,
): FacebookGoalInputs {
  const objective = String(data.campaign_objective || "").toUpperCase();
  const resultKind = data.result_kind ? String(data.result_kind) : null;
  const type = addFacebookCampaignTypeRow(
    { configured: inputs.configuredType, stored: inputs.storedType },
    data,
  );
  return {
    campaignType: type.configured ?? type.stored,
    configuredType: type.configured,
    storedType: type.stored,
    objective: inputs.objective || objective || null,
    resultKind: inputs.resultKind || resultKind,
    leads: inputs.leads + getLeadsFromData(data),
    purchases: inputs.purchases + (Number(data.purchases) || 0),
    revenue: inputs.revenue + (Number(data.purchase_value) || 0),
  };
}
