/**
 * Meta ad accounts with spend over the last 7 complete days that are not
 * mapped to any report table or client (AIO-238): one tenant-level run per
 * tenant, covering every one of its org-level connections.
 */
import type { CallBudget } from "../_shared/reconcile/budget.ts";
import { isBudgetError, redactedMessage } from "../_shared/reconcile/errors.ts";
import { RECONCILE_TOLERANCE, round2 } from "../_shared/reconcile/metrics.ts";
import type { ReconcileFinding } from "../_shared/reconcile/types.ts";
import type { MetaAccountWithSpend } from "./meta-accounts.ts";
import type { StoredRun } from "./store.ts";
import type { TenantConnections } from "./unmapped-accounts-db.ts";
import { type TenantScan, unmappedRun } from "./unmapped-run.ts";

export type UnmappedAccountsDeps = {
  cursor: string | null;
  nextTenant: (
    afterTenantId: string | null,
  ) => Promise<TenantConnections | null>;
  mapped: Set<string>;
  listAccounts: (token: string) => Promise<MetaAccountWithSpend[]>;
  saveRun: (run: StoredRun, findings: ReconcileFinding[]) => Promise<string>;
  budget: CallBudget;
  now: () => Date;
  deadline: number;
  minSpend?: number;
};

/**
 * Tenants are walked one at a time after `cursor` (the last tenant fully
 * checked). When the call runs out of budget or time inside a tenant, nothing
 * is saved for it and the next call starts that tenant again, so a run never
 * reports "ok" from half of a tenant's connections. Only a tenant too big for a
 * whole call on its own is saved partial (flagged incomplete) so the walk moves on.
 */
export async function runUnmappedAccountsCheck(
  deps: UnmappedAccountsDeps,
): Promise<{ next_cursor: string | null; done: boolean; tenants: number }> {
  const outOfRoom = () =>
    Date.now() >= deps.deadline || deps.budget.remaining < 1;
  let cursor = deps.cursor;
  let tenants = 0;

  for (;;) {
    if (outOfRoom()) {
      return { next_cursor: cursor, done: false, tenants };
    }
    const group = await deps.nextTenant(cursor);
    if (!group) {
      return { next_cursor: null, done: true, tenants };
    }
    const startedAt = deps.now();
    const scan = await scanTenantConnections(group, deps, outOfRoom);
    // Retry the tenant from scratch on the next call rather than store half of it.
    if (!scan.complete && tenants > 0) {
      return { next_cursor: cursor, done: false, tenants };
    }
    const { run, kept } = unmappedRun(group, scan, startedAt, deps.now());
    await deps.saveRun(run, kept);
    tenants += 1;
    cursor = group.tenant_id;
    if (!scan.complete) {
      return { next_cursor: cursor, done: false, tenants };
    }
  }
}

/** Lists the accounts each connection sees and keeps the unmapped ones with spend. */
async function scanTenantConnections(
  group: TenantConnections,
  deps: UnmappedAccountsDeps,
  outOfRoom: () => boolean,
): Promise<TenantScan> {
  const minSpend = deps.minSpend ?? RECONCILE_TOLERANCE.money;
  const scan: TenantScan = {
    findings: [],
    errors: [],
    accountsSeen: 0,
    complete: true,
  };
  const reported = new Set<string>();
  for (const conn of group.connections) {
    if (outOfRoom()) {
      scan.complete = false;
      break;
    }
    try {
      const accounts = await deps.listAccounts(conn.token);
      scan.accountsSeen += accounts.length;
      for (const acct of accounts) {
        const skip =
          deps.mapped.has(acct.account_id) ||
          acct.spend_7d <= minSpend ||
          reported.has(acct.account_id);
        if (!skip) {
          reported.add(acct.account_id);
          scan.findings.push(unmappedFinding(acct, conn.id));
        }
      }
    } catch (err) {
      if (isBudgetError(err)) {
        scan.complete = false;
        break;
      }
      scan.errors.push(redactedMessage(err));
    }
  }
  return scan;
}

/** An unmapped_account finding for `acct`, seen through connection `connectionId`. */
function unmappedFinding(
  acct: MetaAccountWithSpend,
  connectionId: string,
): ReconcileFinding {
  return {
    kind: "unmapped_account",
    campaign_id: null,
    date: null,
    metric: "spend",
    aios_value: 0,
    platform_value: round2(acct.spend_7d),
    details: {
      account_id: acct.account_id,
      account_name: acct.name,
      currency: acct.currency,
      connection_id: connectionId,
    },
  };
}
