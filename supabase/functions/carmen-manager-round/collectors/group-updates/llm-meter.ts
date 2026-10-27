/**
 * The round's LLM allowance for one tenant (plan C7): nothing once the
 * tenant's month-to-date ai_usage_log spend reaches its monthly_budget_usd
 * (the active 'llm' integration), and per Israel day at most
 * round_llm_share_pct of that budget / 30, or $1 when no budget is set. This
 * run's calls are added as they finish, since the usage log is written
 * asynchronously. AIO-252's chat collector meters the same way over the same
 * carmen_round_llm_spend; one of the two moves to a shared module once both
 * land.
 */
import type { Json } from "../../../_shared/database.types.ts";
import {
  jerusalemDayStartIso,
  jerusalemYmd,
} from "../../../_shared/calendarTimeZone.ts";
import type { ManagerSettings } from "../../../_shared/manager-round/settings.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

/** Every ai_usage_log source of the round starts with this. */
export const ROUND_SOURCE_PREFIX = "manager_round:";
const DEFAULT_DAILY_USD = 1;

export type LlmLimits = {
  monthBudgetUsd: number | null;
  monthSpentUsd: number;
  dailyCapUsd: number;
  daySpentUsd: number;
};

export type LlmMeter = {
  /** True while today's share and the month's budget both have room. */
  allows(): boolean;
  /** Counts one finished call and its cost. */
  add(costUsd: number): void;
  usage(): { calls: number; costUsd: number };
};

/** The tenant's allowance now, from its budget and what it spent. */
export async function loadLlmMeter(
  db: DbClient,
  tenantId: string,
  settings: Pick<ManagerSettings, "round_llm_share_pct">,
  now: Date,
): Promise<LlmMeter> {
  const [budget, spend] = await Promise.all([
    monthlyBudget(db, tenantId),
    db.rpc("carmen_round_llm_spend", {
      p_tenant_id: tenantId,
      p_month_start: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      ).toISOString(),
      p_day_start: jerusalemDayStartIso(jerusalemYmd(now)),
      p_source_prefix: ROUND_SOURCE_PREFIX,
    }),
  ]);
  throwIf(spend.error, "carmen_round_llm_spend");
  const [spent] = spend.data ?? [];
  return createLlmMeter({
    monthBudgetUsd: budget,
    monthSpentUsd: Number(spent?.month_usd ?? 0),
    dailyCapUsd: budget
      ? (budget * settings.round_llm_share_pct) / 100 / 30
      : DEFAULT_DAILY_USD,
    daySpentUsd: Number(spent?.day_usd ?? 0),
  });
}

/** A meter over fixed limits, counting this run's calls. */
export function createLlmMeter(limits: LlmLimits): LlmMeter {
  let calls = 0;
  let costUsd = 0;
  return {
    allows: () =>
      (limits.monthBudgetUsd === null ||
        limits.monthSpentUsd + costUsd < limits.monthBudgetUsd) &&
      limits.daySpentUsd + costUsd < limits.dailyCapUsd,
    add(cost) {
      calls += 1;
      costUsd += cost;
    },
    usage: () => ({ calls, costUsd }),
  };
}

/** monthly_budget_usd of the tenant's active LLM integration, or null. */
async function monthlyBudget(
  db: DbClient,
  tenantId: string,
): Promise<number | null> {
  const { data, error } = await db
    .from("tenant_integrations")
    .select("settings")
    .eq("tenant_id", tenantId)
    .eq("integration_type", "llm")
    .eq("is_active", true);
  throwIf(error, "tenant_integrations");
  const budgets = (data ?? []).flatMap((row) => budgetOf(row.settings) ?? []);
  return budgets.length ? Math.max(...budgets) : null;
}

/** A positive settings.monthly_budget_usd, or null. */
function budgetOf(settings: Json | null): number | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = Number(settings.monthly_budget_usd);
  return Number.isFinite(value) && value > 0 ? value : null;
}
