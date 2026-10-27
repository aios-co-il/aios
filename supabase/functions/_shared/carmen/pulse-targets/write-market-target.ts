import { buildPulseTargetPatch } from "../../pulse/targets/patch.ts";
import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import type { TargetInput } from "./parse-target-input.ts";
import type { PlatformTable } from "./platform-tables.ts";
import type { PulseCampaignMatch } from "./snapshot-rows.ts";
import { writeTableSettings } from "./write-table-settings.ts";

/** What a market-target write did: the tables written, or the error that stopped it. */
export type MarketTargetWrite =
  | { ok: true; written: WrittenTable[]; setAt: string }
  | { ok: false; error: string; written: WrittenTable[] };

type WrittenTable = { table_id: string; integration_type: string | null };

/**
 * Writes Carmen's market estimate to each table, one at a time. A failed write,
 * or one that matched no table, stops the loop and says which tables were
 * already written; the settings JSON has no multi-row transaction to roll them
 * back.
 */
export async function writeMarketTarget(
  db: PulseTargetDb,
  ctx: PulseTargetToolContext,
  {
    input,
    rationale,
    campaign,
    tables,
  }: {
    input: TargetInput;
    rationale: string;
    campaign: PulseCampaignMatch | null;
    tables: PlatformTable[];
  },
): Promise<MarketTargetWrite> {
  const setAt = (ctx.now?.() ?? new Date()).toISOString();
  const written: WrittenTable[] = [];
  for (const table of tables) {
    const next = buildPulseTargetPatch(table.integration_settings || {}, {
      goal: input.goal,
      kind: input.kind,
      value: input.value,
      source: "carmen_market",
      rationale,
      campaignId: campaign?.campaignId ?? null,
      campaignName: campaign?.campaignName ?? null,
      setBy: "carmen",
      setAt,
    });
    // Read-modify-write of integration_settings: a sync writing the same JSON
    // between the read and this update can lose one side's change. An atomic
    // jsonb_set RPC would need a migration; targets are rare manual writes.
    const error = await writeTableSettings(db, {
      tableId: table.id,
      tenantIds: ctx.accessibleTenantIds,
      settings: next,
    });
    if (error) {
      return { ok: false, error, written };
    }
    written.push({
      table_id: table.id,
      integration_type: table.integration_type,
    });
  }
  return { ok: true, written, setAt };
}
