import type { AgentRow } from "../database-contracts.ts";
import type { Database } from "../../_shared/database.types.ts";
import type { clientPerformanceEntry } from "../client-performance.ts";

export type PerformanceScopeClient = Pick<
  AgentRow<"clients">,
  "id" | "name" | "agency_id"
> & { agencies: { name: string } | null };
export type CampaignTableMatch =
  Database["public"]["Functions"]["find_campaign_tables"]["Returns"][number];
export type RankedPerformanceEntry = ReturnType<
  typeof clientPerformanceEntry
> & { spend_change_pct?: number | null };
