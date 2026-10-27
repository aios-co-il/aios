import {
  effectiveFacebookCampaignType,
  getLeadsFromData,
  isFacebookEcommerceCampaign,
  preferFacebookCampaignType,
} from "@/lib/adsMetrics";
import type { ReportCampaignGoal } from "@/lib/campaignGoals";

type RecordData = Record<string, unknown>;

/** What decides a Facebook campaign's goal, gathered over its stored rows. */
export type FacebookGoalInputs = {
  /** Strongest stored type across the rows: sales, then leads, then traffic. */
  campaignType: "lead" | "ecommerce" | "traffic" | "other";
  objective: string | null;
  resultKind: string | null;
  leads: number;
  purchases: number;
  revenue: number;
};

/**
 * Goal of one Facebook campaign in every campaign report: the internal report,
 * the shared report and its KPIs, and the weekly tab. Traffic stays traffic, a
 * leads-only table keeps everything else in leads, and otherwise the stored
 * type, the Meta objective, the configured result and the results decide.
 */
export function facebookCampaignGoal(
  inputs: FacebookGoalInputs,
  options: { leadsOnly: boolean },
): ReportCampaignGoal {
  if (inputs.campaignType === "traffic") {
    return "traffic";
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
  return {
    campaignType: preferFacebookCampaignType(
      inputs.campaignType,
      effectiveFacebookCampaignType(data),
    ),
    objective: inputs.objective || objective || null,
    resultKind: inputs.resultKind || resultKind,
    leads: inputs.leads + getLeadsFromData(data),
    purchases: inputs.purchases + (Number(data.purchases) || 0),
    revenue: inputs.revenue + (Number(data.purchase_value) || 0),
  };
}
