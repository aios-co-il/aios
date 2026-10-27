/**
 * The round's LLM allowance for one tenant: nothing once the
 * month-to-date LLM spend reaches the tenant's monthly_budget_usd (its active
 * 'llm' integration), and per Israel day at most round_llm_share_pct of that
 * budget / 30, or $1 when no budget is set; a share of 0 turns the model off
 * (markers only). The month spend is the project's, summed as the health
 * probe sums it (UTC month), because the OpenAI key and its budget are
 * project-wide today. This run's calls are added as they finish, since the
 * usage log is written asynchronously. AIO-252's collectors/chat/llm-meter.ts
 * meters the same way over the same carmen_round_llm_spend. AIO-252 merges
 * first; AIO-254 then takes develop, meters through that module and deletes
 * this copy before it merges.
 */
import type { Json } from "../../../_shared/database.types.ts";
import {
  jerusalemDayStartIso,
  jerusalemYmd,
} from "../../../_shared/calendarTimeZone.ts";
import { jsonObject } from "../../../_shared/manager-round/json-object.ts";
import type { ManagerSettings } from "../../../_shared/manager-round/settings.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../../_shared/manager-round/db-error.ts";

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
    monthSpentUsd: Number(spent?.project_month_usd ?? 0),
    dailyCapUsd: dailyCap(budget, settings.round_llm_share_pct),
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

/** The day's share of the budget; 0 when the share is 0, $1 without a budget. */
function dailyCap(budget: number | null, sharePct: number): number {
  if (sharePct === 0) {
    return 0;
  }
  return budget ? (budget * sharePct) / 100 / 30 : DEFAULT_DAILY_USD;
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
  const value = Number(jsonObject(settings)?.monthly_budget_usd);
  return Number.isFinite(value) && value > 0 ? value : null;
}
