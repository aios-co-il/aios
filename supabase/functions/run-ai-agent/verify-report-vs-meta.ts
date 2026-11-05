/**
 * verify_report_vs_meta (AIO-238): Carmen's live check of the scoped Meta
 * report tables, day by day in each ad account's time zone, built on the
 * reconciliation core. It has no table cap: a deadline, the call budget or a
 * Meta rate limit lists whatever was not reached instead.
 */
import { CallBudget, MIN_CALLS } from "../_shared/reconcile/budget.ts";
import { redactedMessage } from "../_shared/reconcile/errors.ts";
import type { FetchLike, Sleep } from "../_shared/reconcile/http.ts";
import { createMetaSource } from "../_shared/reconcile/meta-source.ts";
import { resolveMetaToken } from "../_shared/reconcile/meta-token.ts";
import { reconcileTable } from "../_shared/reconcile/reconcile-table.ts";
import { readAiosCampaignRows } from "../_shared/reconcile/tables.ts";
import type {
  ListedTable,
  PlatformSource,
} from "../_shared/reconcile/types.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { toVerifyResult } from "./verify-result.ts";
import { summarizeVerify, type VerifyRun } from "./verify-summary.ts";

/**
 * Meta requests one chat question may spend: about 40 tables at
 * MIN_CALLS.meta each, the scale the tool had before. Every call shares the
 * tenant's tokens with the scheduled syncs, so the check stays small and stops
 * at Meta's first rate limit.
 */
export const VERIFY_CALL_BUDGET = 160;

export const VERIFY_CONCURRENCY = 2;

const VERIFY_DEADLINE_MS = 75_000;

type VerifyInput = {
  db: Pick<DbClient, "from">;
  tables: ListedTable[];
  days: number;
  now: Date;
  fallbackTenantIds?: string[];
  fetch?: FetchLike;
  sleep?: Sleep;
  budget?: CallBudget;
  concurrency?: number;
  deadlineMs?: number;
};

/** Checks the tables against Meta and answers in the tool's shape. */
export async function verifyReportVsMeta(
  input: VerifyInput,
): Promise<Record<string, unknown>> {
  const budget = input.budget || new CallBudget(VERIFY_CALL_BUDGET);
  const deadline = Date.now() + (input.deadlineMs ?? VERIFY_DEADLINE_MS);
  const source = createMetaSource({
    getToken: (t) => resolveMetaToken(input.db, t, input.fallbackTenantIds),
    budget,
    fetch: input.fetch,
    sleep: input.sleep,
  });
  return summarizeVerify(await checkTables(input, source, budget, deadline));
}

/**
 * Runs the tables through `concurrency` workers. Once Meta refuses the app or
 * token, the deadline passes or the budget cannot cover a table, the rest are
 * listed as not checked.
 */
async function checkTables(
  input: VerifyInput,
  source: PlatformSource,
  budget: CallBudget,
  deadline: number,
): Promise<VerifyRun> {
  const results: Array<Record<string, unknown>> = new Array(
    input.tables.length,
  );
  const run: VerifyRun = { results: [], notChecked: [], rateLimited: false };
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < input.tables.length; i = next++) {
      const table = input.tables[i];
      const label = String(table.client_name || table.client_id);
      const outOfRoom =
        Date.now() >= deadline || budget.remaining < MIN_CALLS.meta;
      if (run.rateLimited || outOfRoom) {
        run.notChecked.push(label);
        continue;
      }
      try {
        const result = await reconcileTable({
          table,
          source,
          readAios: (t, s, e) => readAiosCampaignRows(input.db, t.id, s, e),
          now: input.now,
          days: input.days,
          maxFindings: 1000,
          keepRows: true,
        });
        // Meta refused the app or token: asking for more tables only burns quota.
        if (
          result.error_kind === "rate_limit" &&
          result.rate_limit_scope !== "account"
        ) {
          run.rateLimited = true;
        }
        results[i] = toVerifyResult(table, result);
      } catch (err) {
        console.warn(
          `[verify] ${table.id} not checked: ${redactedMessage(err)}`,
        );
        run.notChecked.push(label);
      }
    }
  };
  const workers = Math.min(
    input.concurrency ?? VERIFY_CONCURRENCY,
    input.tables.length,
  );
  await Promise.all(Array.from({ length: workers }, worker));
  run.results = results.filter(Boolean);
  return run;
}
