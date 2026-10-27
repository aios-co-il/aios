import { useMemo, useState } from "react";
import type { PulseAttentionRow } from "@/lib/pulseAttentionMatrix";
import type {
  PulseCampaignGoal,
  PulseCampaignGoalRow,
} from "@/lib/pulseCampaignGoals";
import {
  pulsePlatformKey,
  type PulseCampaignTable,
} from "@/lib/pulseDashboard";
import type { PulsePlatform } from "../../../supabase/functions/_shared/pulse/platforms.ts";
import { listCampaignsWithoutTarget } from "../../../supabase/functions/_shared/pulse/targets/missing.ts";
import type { PulseTargetEditorContext } from "./PulseTargetEditorDialog/PulseTargetEditorDialog";

/**
 * The dashboard's target editor and the "בלי יעד" tab: which client × platform
 * the editor is open for, its campaigns, and the spending campaigns that have no
 * target.
 */
export function usePulseTargetEditor({
  tables,
  campaignRows,
  clientMetaById,
}: {
  tables: PulseCampaignTable[];
  campaignRows: PulseCampaignGoalRow[];
  clientMetaById: Map<string, { name: string }>;
}) {
  const [context, setContext] = useState<PulseTargetEditorContext | null>(null);
  const tableTypeById = useMemo(
    () => new Map(tables.map((table) => [table.id, table.integration_type])),
    [tables],
  );
  const missingGroups = useMemo(
    () => listCampaignsWithoutTarget({ campaignRows, tables }),
    [campaignRows, tables],
  );
  const missingCount = useMemo(
    () =>
      missingGroups.reduce((total, group) => total + group.campaigns.length, 0),
    [missingGroups],
  );
  const campaigns = useMemo(
    () =>
      context
        ? campaignRows.filter(
            (row) =>
              row.client_id === context.clientId &&
              row.platform === context.platform,
          )
        : [],
    [context, campaignRows],
  );

  return {
    context,
    campaigns,
    tableTypeById,
    missingGroups,
    missingCount,
    close: () => setContext(null),
    openFromAttention: (row: PulseAttentionRow) =>
      setContext({
        clientId: row.clientId,
        clientName: row.clientName,
        platform: row.platform,
        primaryGoal: row.primaryGoal,
        platformTableIds: platformTableIds(tables, row.clientId, row.platform),
        baselineEfficiency7d: row.baselineEfficiency7d,
      }),
    openForClient: (
      clientId: string,
      platform: PulsePlatform,
      goal: PulseCampaignGoal,
    ) =>
      setContext({
        clientId,
        clientName: clientMetaById.get(clientId)?.name ?? "לקוח",
        platform,
        primaryGoal: goal,
        platformTableIds: platformTableIds(tables, clientId, platform),
      }),
  };
}

/** Every report table of the client × platform: a platform target goes to all. */
export function platformTableIds(
  tables: PulseCampaignTable[],
  clientId: string,
  platform: PulsePlatform,
): string[] {
  return tables
    .filter(
      (table) =>
        table.client_id === clientId &&
        pulsePlatformKey(table.integration_type) === platform,
    )
    .map((table) => table.id);
}
