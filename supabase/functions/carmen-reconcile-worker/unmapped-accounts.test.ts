import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import { CallBudget } from "../_shared/reconcile/budget.ts";
import { ReconcileSourceError } from "../_shared/reconcile/errors.ts";
import type { MetaAccountWithSpend } from "./meta-accounts.ts";
import { NOW, type SavedRun } from "./test-fixtures.ts";
import { runUnmappedAccountsCheck } from "./unmapped-accounts.ts";
import type { TenantConnections } from "./unmapped-accounts-db.ts";

/** An ILS ad account with this 7-day spend. */
const acct = (
  account_id: string,
  spend_7d: number,
  name = account_id,
): MetaAccountWithSpend => ({ account_id, name, currency: "ILS", spend_7d });

/** nextTenant over a fixed list, in tenant order. */
const tenantWalk = (groups: TenantConnections[]) => (after: string | null) =>
  Promise.resolve(
    groups
      .filter((g) => !after || g.tenant_id > after)
      .sort((a, b) => a.tenant_id.localeCompare(b.tenant_id))[0] || null,
  );

/** Check dependencies over fixed tenants and per-token account lists; saved runs go to `saved`. */
function unmappedDeps(
  groups: TenantConnections[],
  accountsByToken: Record<string, MetaAccountWithSpend[] | Error>,
  budget: CallBudget,
  saved: SavedRun[],
  cursor: string | null = null,
) {
  return {
    cursor,
    nextTenant: tenantWalk(groups),
    mapped: new Set(["act_1"]),
    listAccounts: (token: string) => {
      budget.take();
      const answer = accountsByToken[token];
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer || []);
    },
    saveRun: (run: SavedRun["run"], findings: SavedRun["findings"]) => {
      saved.push({ run, findings });
      return Promise.resolve("x");
    },
    budget,
    now: () => NOW,
    deadline: Date.now() + 60_000,
  };
}

describe("runUnmappedAccountsCheck", () => {
  it("reports spend above the floor on accounts mapped nowhere", async () => {
    const saved: SavedRun[] = [];
    const accounts = [
      acct("act_1", 900, "Mapped"),
      acct("act_2", 450, "Orphan"),
      acct("act_3", 12, "Tiny"),
    ];
    const r = await runUnmappedAccountsCheck(
      unmappedDeps(
        [
          {
            tenant_id: "tenant-1",
            connections: [
              { id: "i1", token: "t1" },
              { id: "i2", token: "t2" },
            ],
          },
          { tenant_id: "tenant-2", connections: [{ id: "i3", token: "t3" }] },
        ],
        {
          t1: accounts,
          t2: accounts,
          t3: new ReconcileSourceError("auth", "Meta 400: expired"),
        },
        new CallBudget(10),
        saved,
      ),
    );
    assertStrictEquals(r.done, true);
    assertStrictEquals(r.next_cursor, null);
    assertEquals(
      saved.map((s) => [
        s.run.tenant_id,
        s.run.status,
        s.findings.map((f) => f.details.account_id),
      ]),
      [
        ["tenant-1", "mismatch", ["act_2"]],
        ["tenant-2", "failed", []],
      ],
    );
    assertStrictEquals(saved[0].run.table_id, null);
  });

  it("checks a tenant split across calls whole, never 'ok' from half", async () => {
    // tenant-2's first connection sees an unmapped account; its second sees
    // only mapped ones. The first call runs out of budget between them.
    const groups: TenantConnections[] = [
      { tenant_id: "tenant-1", connections: [{ id: "a", token: "ta" }] },
      {
        tenant_id: "tenant-2",
        connections: [
          { id: "c1", token: "t1" },
          { id: "c2", token: "t2" },
        ],
      },
    ];
    const accounts = {
      ta: [acct("act_1", 300)],
      t1: [acct("act_9", 500)],
      t2: [acct("act_1", 800)],
    };
    const saved: SavedRun[] = [];
    const first = await runUnmappedAccountsCheck(
      unmappedDeps(groups, accounts, new CallBudget(2), saved),
    );
    // tenant-1 done; tenant-2 was cut short, so nothing is stored for it yet.
    assertStrictEquals(first.done, false);
    assertStrictEquals(first.next_cursor, "tenant-1");
    assertEquals(
      saved.map((s) => [s.run.tenant_id, s.run.status]),
      [["tenant-1", "ok"]],
    );

    const second = await runUnmappedAccountsCheck(
      unmappedDeps(
        groups,
        accounts,
        new CallBudget(10),
        saved,
        first.next_cursor,
      ),
    );
    assertStrictEquals(second.done, true);
    const tenant2 = saved.filter((s) => s.run.tenant_id === "tenant-2");
    assertStrictEquals(tenant2.length, 1);
    assertStrictEquals(tenant2[0].run.status, "mismatch");
    assertEquals(
      tenant2[0].findings.map((f) => f.details.account_id),
      ["act_9"],
    );
    assertStrictEquals(tenant2[0].run.summary.incomplete, undefined);
  });

  it("stores a tenant too big for one call flagged incomplete and moves on", async () => {
    const groups: TenantConnections[] = [
      {
        tenant_id: "tenant-1",
        connections: [
          { id: "c1", token: "t1" },
          { id: "c2", token: "t2" },
        ],
      },
      { tenant_id: "tenant-2", connections: [{ id: "c3", token: "t3" }] },
    ];
    const accounts = { t1: [acct("act_1", 50)], t2: [], t3: [] };
    const saved: SavedRun[] = [];
    const first = await runUnmappedAccountsCheck(
      unmappedDeps(groups, accounts, new CallBudget(1), saved),
    );
    assertStrictEquals(first.next_cursor, "tenant-1");
    assertEquals(
      saved.map((s) => [
        s.run.tenant_id,
        s.run.status,
        s.run.summary.incomplete,
      ]),
      [["tenant-1", "skipped", true]],
    );
    const second = await runUnmappedAccountsCheck(
      unmappedDeps(
        groups,
        accounts,
        new CallBudget(5),
        saved,
        first.next_cursor,
      ),
    );
    assertStrictEquals(second.done, true);
    assertEquals(
      saved.map((s) => s.run.tenant_id),
      ["tenant-1", "tenant-2"],
    );
  });

  it("records a tenant with only private connections as not checked", async () => {
    const saved: SavedRun[] = [];
    const budget = new CallBudget(10);
    const r = await runUnmappedAccountsCheck(
      unmappedDeps(
        [
          { tenant_id: "tenant-1", connections: [] },
          { tenant_id: "tenant-2", connections: [{ id: "c1", token: "t1" }] },
        ],
        { t1: [acct("act_1", 300)] },
        budget,
        saved,
      ),
    );
    assertStrictEquals(r.done, true);
    // No Meta call for tenant-1, and no "ok" that covered nothing.
    assertStrictEquals(budget.used, 1);
    assertEquals(
      saved.map((s) => [
        s.run.tenant_id,
        s.run.status,
        s.run.summary.unmapped_check,
        s.run.summary.skipped_reason,
      ]),
      [
        ["tenant-1", "skipped", "no_org_connections", "no_org_connections"],
        ["tenant-2", "ok", undefined, undefined],
      ],
    );
  });

  it("ends the walk only when no tenant is left", async () => {
    const groups: TenantConnections[] = Array.from({ length: 250 }, (_, i) => ({
      tenant_id: `tenant-${String(i).padStart(3, "0")}`,
      connections: [{ id: `c${i}`, token: `t${i}` }],
    }));
    const saved: SavedRun[] = [];
    let cursor: string | null = null;
    let calls = 0;
    for (;;) {
      calls += 1;
      const r = await runUnmappedAccountsCheck(
        unmappedDeps(groups, {}, new CallBudget(60), saved, cursor),
      );
      if (r.done) {
        break;
      }
      cursor = r.next_cursor;
    }
    assertStrictEquals(saved.length, 250);
    assertStrictEquals(calls, 5);
  });
});
