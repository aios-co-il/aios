import { isPulseTargetGoal } from "./kinds.ts";
import { resolvePulseTarget } from "./resolve.ts";

/** The fields of a pulse campaign row (campaign_breakdown) the list reads. */
export type CampaignRowFields = {
  campaign_key?: unknown;
  campaign_id?: unknown;
  campaign_name?: unknown;
  client_id?: unknown;
  table_id?: unknown;
  platform?: unknown;
  goal?: unknown;
  spend_7d?: unknown;
  delivery_status?: unknown;
  target_value?: unknown;
  efficiency_7d?: unknown;
};

/** A spending campaign with no target of any source. */
export type CampaignWithoutTarget<Row extends CampaignRowFields> = {
  campaign_key: Row["campaign_key"];
  campaign_id: Row["campaign_id"] | null;
  campaign_name: Row["campaign_name"];
  table_id: Row["table_id"];
  goal: Row["goal"];
  spend_7d: number;
  efficiency_7d: Row["efficiency_7d"] | null;
};

/** One client × platform's campaigns without a target, biggest spend first. */
export type PlatformWithoutTarget<Row extends CampaignRowFields> = {
  client_id: Row["client_id"];
  platform: Row["platform"];
  spend_7d: number;
  campaigns: CampaignWithoutTarget<Row>[];
};

/** A report table with its stored settings. */
export type TableSettings = { id: string; integration_settings?: unknown };

/**
 * Campaigns that spent money in the last 7 days and have no target of any source,
 * grouped by client and platform. Only lead and ecommerce campaigns are listed:
 * they are the ones a CPL / CPA / ROAS target is set for.
 */
export function listCampaignsWithoutTarget<Row extends CampaignRowFields>({
  campaignRows = [],
  tables = [],
}: {
  campaignRows?: Row[];
  tables?: TableSettings[];
}): PlatformWithoutTarget<Row>[] {
  const settingsById = new Map(
    tables.map((table) => [table.id, table.integration_settings || {}]),
  );
  const groups = new Map<string, PlatformWithoutTarget<Row>>();
  for (const row of campaignRows) {
    if (!lacksTarget(row, settingsById)) {
      continue;
    }
    const key = `${row.client_id}:${row.platform}`;
    const group: PlatformWithoutTarget<Row> = groups.get(key) || {
      client_id: row.client_id,
      platform: row.platform,
      spend_7d: 0,
      campaigns: [],
    };
    group.spend_7d += Number(row.spend_7d) || 0;
    group.campaigns.push({
      campaign_key: row.campaign_key,
      campaign_id: row.campaign_id ?? null,
      campaign_name: row.campaign_name,
      table_id: row.table_id,
      goal: row.goal,
      spend_7d: Number(row.spend_7d) || 0,
      efficiency_7d: row.efficiency_7d ?? null,
    });
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      spend_7d: Math.round(group.spend_7d * 100) / 100,
      campaigns: group.campaigns.sort((a, b) => b.spend_7d - a.spend_7d),
    }))
    .sort((a, b) => b.spend_7d - a.spend_7d);
}

/** A live lead or ecommerce campaign with spend that no target applies to. */
function lacksTarget(
  row: CampaignRowFields,
  settingsById: Map<string, unknown>,
): boolean {
  if (!isPulseTargetGoal(row.goal) || !((Number(row.spend_7d) || 0) > 0)) {
    return false;
  }
  if (row.delivery_status === "paused" || row.delivery_status === "removed") {
    return false;
  }
  // The pulse row resolved its target over every table the campaign is read
  // from; a stored snapshot can be older than a target set since, so the row's
  // own table is read again as well.
  if (row.target_value !== null && row.target_value !== undefined) {
    return false;
  }
  const settings =
    typeof row.table_id === "string" ? settingsById.get(row.table_id) : null;
  return (
    Boolean(settings) &&
    !resolvePulseTarget(settings, row.goal, {
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
    })
  );
}
