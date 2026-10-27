/**
 * The round's LLM allowance for one tenant (plan C7): nothing once the
 * month-to-date LLM spend reaches the tenant's monthly_budget_usd (its active
 * 'llm' integration), and per Israel day at most round_llm_share_pct of that
 * budget / 30, or $1 when no budget is set; a share of 0 turns the model off
 * (markers only). The month spend is the project's, as the health probe sums
 * it (UTC month, every tenant's LLM tables), because the OpenAI key and its
 * budget are project-wide today. Calls of this run are added as they finish,
 * since the usage log is written asynchronously.
 */
import type { Json } from "../../../_shared/database.types.ts";
import { jerusalemYmd } from "../../../_shared/calendarTimeZone.ts";
import type { ManagerSettings } from "../../../_shared/manager-round/settings.ts";
import { jerusalemLocalTimeToUtc } from "../../../_shared/shabbat/quiet-window.ts";
import type { DbClient } from "../../../_shared/supabase-clients.ts";
import { throwIf } from "../../db-error.ts";

/** ai_usage_log.source of the chat classification. */
export const CHAT_LLM_SOURCE = "manager_round:chat";

/** Every source of the round starts with this. */
const ROUND_SOURCE_PREFIX = "manager_round:";
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
      p_day_start: jerusalemLocalTimeToUtc(jerusalemYmd(now), 0).toISOString(),
      p_source_prefix: ROUND_SOURCE_PREFIX,
    }),
  ]);
  throwIf(spend.error, "carmen_round_llm_spend");
  const [spent] = spend.data ?? [];
  const share = settings.round_llm_share_pct;
  return createLlmMeter({
    monthBudgetUsd: budget,
    monthSpentUsd: Number(spent?.project_month_usd ?? 0),
    dailyCapUsd:
      share === 0
        ? 0
        : budget
          ? (budget * share) / 100 / 30
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
  const budgets = (data ?? []).map((row) => budgetOf(row.settings));
  const set = budgets.filter((value): value is number => value !== null);
  return set.length ? Math.max(...set) : null;
}

/** A positive settings.monthly_budget_usd, or null. */
function budgetOf(settings: Json): number | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const value = Number(settings.monthly_budget_usd);
  return Number.isFinite(value) && value > 0 ? value : null;
}
