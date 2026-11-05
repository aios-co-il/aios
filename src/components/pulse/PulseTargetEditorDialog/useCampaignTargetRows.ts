import { useMemo } from "react";
import type { PulseCampaignGoalRow } from "@/lib/pulseCampaignGoals";
import {
  isPulseTargetGoal,
  isTargetKind,
  normalizeTargetSource,
  pulseTargetDirection,
  type PulseTarget,
  type PulseTargetGoal,
} from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import {
  compareTargets,
  resolvePulseTarget,
} from "../../../../supabase/functions/_shared/pulse/targets/resolve.ts";
import { inheritedFrom } from "./targetFormat";

/** One editable campaign: the target it shows and where a save goes. */
export type CampaignTargetRow = {
  row: PulseCampaignGoalRow;
  goal: PulseTargetGoal;
  target: PulseTarget | null;
  /** Where the shown target comes from when it is not the campaign's own. */
  inherited: string | null;
  /** Save over the entry the shown target came from. */
  saveTo: { tableIds: string[]; campaignId: string | null };
};

/** The editor's lead and ecommerce campaigns, biggest 7-day spend first. */
export function useCampaignTargetRows(
  campaigns: PulseCampaignGoalRow[],
  tableSettingsById: Map<string, Record<string, unknown>>,
): CampaignTargetRow[] {
  return useMemo(
    () =>
      [...campaigns]
        .sort((a, b) => (b.spend_7d || 0) - (a.spend_7d || 0))
        .flatMap((row) => {
          if (!isPulseTargetGoal(row.goal)) {
            return [];
          }
          const { target, tableId, campaignId } = campaignRowTarget(
            row,
            tableSettingsById,
          );
          return [
            {
              row,
              goal: row.goal,
              target,
              inherited: inheritedFrom(target, "campaign"),
              saveTo: { tableIds: [tableId], campaignId },
            },
          ];
        }),
    [campaigns, tableSettingsById],
  );
}

/**
 * The target that applies to a pulse row, and where to save over it. The row's
 * own target was resolved over every table the campaign is read from (duplicate
 * report tables); the row's table is read again too, so a save shows before the
 * rows are rebuilt. Same order as the pulse: approved first, then the most
 * specific level.
 */
export function campaignRowTarget(
  row: PulseCampaignGoalRow,
  tableSettingsById: Map<string, Record<string, unknown>>,
): { target: PulseTarget | null; tableId: string; campaignId: string | null } {
  const here = { tableId: row.table_id, campaignId: row.campaign_id };
  const fresh = resolvePulseTarget(
    tableSettingsById.get(row.table_id) ?? {},
    row.goal,
    { campaignId: row.campaign_id, campaignName: row.campaign_name },
  );
  const fromRow = storedRowTarget(row);
  if (!fromRow || (fresh && compareTargets(fromRow, fresh) >= 0)) {
    return { target: fresh, ...here };
  }
  return fromRow.scope === "campaign" && row.target_table_id
    ? {
        target: fromRow,
        tableId: row.target_table_id,
        campaignId: row.target_campaign_id ?? row.campaign_id,
      }
    : { target: fromRow, ...here };
}

/** The target the pulse row was built with, when it has one. */
function storedRowTarget(row: PulseCampaignGoalRow): PulseTarget | null {
  const value = row.target_value;
  const kind = row.target_kind;
  if (value === null || value === undefined || !isTargetKind(kind)) {
    return null;
  }
  return {
    value,
    kind,
    direction: pulseTargetDirection(kind),
    source: normalizeTargetSource(row.target_source),
    scope: row.target_scope ?? "campaign",
    rationale: row.target_rationale ?? null,
    set_at: null,
    set_by: null,
  };
}
