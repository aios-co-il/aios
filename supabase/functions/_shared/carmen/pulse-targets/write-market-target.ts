import type { PulseTargetDb, PulseTargetToolContext } from "./context.ts";
import type { TargetInput } from "./parse-target-input.ts";
import type { PlatformTable } from "./platform-tables.ts";
import type { PulseCampaignMatch } from "./snapshot-rows.ts";
import { writeTargetToTables } from "./write-target-tables.ts";

/**
 * What a market-target write did: every table written, or none and the error
 * that stopped it, with any table whose restore failed and keeps the estimate.
 */
export type MarketTargetWrite =
  | { ok: true; written: WrittenTable[]; setAt: string }
  | { ok: false; error: string; stillWritten: string[] };

type WrittenTable = { table_id: string; integration_type: string | null };

/** Writes Carmen's market estimate to every table, or to none (writeTargetToTables). */
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
  const result = await writeTargetToTables(db, {
    tables,
    tenantIds: ctx.accessibleTenantIds,
    patch: {
      goal: input.goal,
      kind: input.kind,
      value: input.value,
      source: "carmen_market",
      rationale,
      campaignId: campaign?.campaignId ?? null,
      campaignName: campaign?.campaignName ?? null,
      setBy: "carmen",
      setAt,
    },
  });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    setAt,
    written: tables.map((table) => ({
      table_id: table.id,
      integration_type: table.integration_type,
    })),
  };
}
