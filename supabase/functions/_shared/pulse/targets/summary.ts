import { isJsonObject } from "../json.ts";
import { pulsePlatformOf, type PulsePlatform } from "../platforms.ts";
import { campaignTargets, entryGoal, targetFromEntry } from "./entries.ts";
import type { PulseTarget } from "./kinds.ts";
import {
  listCampaignsWithoutTarget,
  type CampaignRowFields,
  type PlatformWithoutTarget,
} from "./missing.ts";
import { resolvePulseTarget } from "./resolve.ts";

/** A report table as get_pulse_targets reads it. */
export type SummaryTable = {
  id: string;
  client_id: string | null;
  integration_type?: string | null;
  integration_settings?: unknown;
};

/** One client's targets: what is set, and which spending campaigns have none. */
export type ClientTargetSummary<Row extends CampaignRowFields> = {
  client_id: unknown;
  platform_targets: Array<
    PulseTarget & { table_id: string; platform: PulsePlatform; goal: string }
  >;
  campaign_targets: Array<
    PulseTarget & {
      table_id: string;
      platform: PulsePlatform;
      campaign: string;
      goal: string;
    }
  >;
  missing: PlatformWithoutTarget<Row>[];
};

/**
 * Targets per client for Carmen's get_pulse_targets: what is set (with source,
 * rationale and date) and which spending campaigns have none.
 */
export function summarizePulseTargets<Row extends CampaignRowFields>({
  tables = [],
  campaignRows = [],
}: {
  tables?: SummaryTable[];
  campaignRows?: Row[];
}): { clients: ClientTargetSummary<Row>[]; missing_count: number } {
  const byClient = new Map<unknown, ClientTargetSummary<Row>>();
  const ensure = (clientId: unknown) => {
    const entry = byClient.get(clientId) || {
      client_id: clientId,
      platform_targets: [],
      campaign_targets: [],
      missing: [],
    };
    byClient.set(clientId, entry);
    return entry;
  };
  for (const table of tables) {
    const platform = pulsePlatformOf(table.integration_type);
    if (platform) {
      addTableTargets(ensure(table.client_id), table, platform);
    }
  }
  const missing = listCampaignsWithoutTarget({ campaignRows, tables });
  for (const group of missing) {
    ensure(group.client_id);
  }
  return {
    clients: [...byClient.values()].map((client) => ({
      ...client,
      missing: missing.filter((group) => group.client_id === client.client_id),
    })),
    missing_count: missing.reduce(
      (total, group) => total + group.campaigns.length,
      0,
    ),
  };
}

/** The table's platform targets per goal and every campaign target it stores. */
function addTableTargets<Row extends CampaignRowFields>(
  client: ClientTargetSummary<Row>,
  table: SummaryTable,
  platform: PulsePlatform,
): void {
  const settings = isJsonObject(table.integration_settings)
    ? table.integration_settings
    : {};
  for (const goal of ["leads", "ecommerce", "engagement"]) {
    const target = resolvePulseTarget(settings, goal, null);
    if (target) {
      client.platform_targets.push({
        table_id: table.id,
        platform,
        goal,
        ...target,
      });
    }
  }
  for (const [slot, entry] of Object.entries(campaignTargets(settings))) {
    const goal = slot === "default" ? null : entryGoal(entry);
    const target = goal ? targetFromEntry(entry, goal, "campaign") : null;
    if (goal && target) {
      client.campaign_targets.push({
        table_id: table.id,
        platform,
        campaign: slot,
        goal,
        ...target,
      });
    }
  }
}
