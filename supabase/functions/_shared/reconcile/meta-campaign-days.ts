/**
 * Meta campaign × day rows of a window (AIO-238), read with the same inputs
 * the syncs use and counted with the same helpers, so leads and purchases are
 * counted exactly the way the stored rows were.
 */
import {
  buildCampaignOptimizationGoalMap,
  buildInsightRecord,
  buildResultLeadTypeMap,
  buildResultMetricMaps,
  type CampaignStatus,
} from "../fbInsights.ts";
import { graphUrl, metaGetPaged, type MetaRequestOptions } from "./meta-api.ts";
import type { CampaignDayRow } from "./types.ts";

type MetaAdset = {
  id?: string;
  campaign_id?: string;
  optimization_goal?: string;
  promoted_object?: unknown;
};

const META_INSIGHT_FIELDS =
  "campaign_id,campaign_name,impressions,reach,frequency,clicks,inline_link_clicks,cpm,ctr,actions,action_values,conversions,cost_per_action_type,cost_per_conversion,spend";

/** Campaign × day rows of ad account `act` over `window`, as cron-sync-facebook-insights builds them. */
export async function readCampaignDays(
  act: string,
  window: { start: string; end: string },
  token: string,
  opts: MetaRequestOptions & { maxPages: number },
): Promise<CampaignDayRow[]> {
  const campaigns = await metaGetPaged<CampaignStatus>(
    graphUrl(
      `${act}/campaigns`,
      {
        fields:
          "id,name,effective_status,configured_status,objective,updated_time",
        limit: "500",
      },
      token,
    ),
    opts,
  );
  const statuses: Record<string, CampaignStatus> = {};
  const objectives: Record<string, string | null | undefined> = {};
  for (const c of campaigns) {
    statuses[c.id] = {
      id: c.id,
      name: c.name,
      effective_status: c.effective_status,
      configured_status: c.configured_status,
      objective: c.objective || null,
      updated_time: c.updated_time || null,
    };
    objectives[c.id] = c.objective || null;
  }
  const adsets = await metaGetPaged<MetaAdset>(
    graphUrl(
      `${act}/adsets`,
      {
        fields: "id,campaign_id,optimization_goal,promoted_object",
        limit: "500",
      },
      token,
    ),
    opts,
  );
  const insights = await metaGetPaged<Record<string, unknown>>(
    graphUrl(
      `${act}/insights`,
      {
        level: "campaign",
        fields: META_INSIGHT_FIELDS,
        time_range: JSON.stringify({ since: window.start, until: window.end }),
        time_increment: "1",
        use_unified_attribution_setting: "true",
        limit: "500",
      },
      token,
    ),
    opts,
  );
  const leadTypes = buildResultLeadTypeMap(adsets, objectives);
  const goals = buildCampaignOptimizationGoalMap(adsets);
  const metrics = buildResultMetricMaps(adsets);
  return insights.map((insight) => {
    const record = buildInsightRecord(
      insight,
      statuses,
      leadTypes,
      goals,
      metrics,
    );
    return {
      campaign_id: String(record.campaign_id || ""),
      campaign_name: record.campaign_name || null,
      date: record.date,
      data: { ...record },
    };
  });
}
