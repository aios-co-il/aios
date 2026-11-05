import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import type { Finding } from "./types.ts";
import { resolveClearedAlerts } from "./resolve-cleared.ts";
import { fakeDb } from "./tests/fake-db.ts";

const NOW = new Date("2026-10-28T10:00:00.000Z");

const OPEN = [
  { id: "a1", campaign_id: "c1", alert_type: "campaign_stopped" },
  { id: "a2", campaign_id: "account:act_1", alert_type: "no_live_ads" },
  { id: "a3", campaign_id: "c3", alert_type: "ad_disapproved" },
];

const finding = (alert_type: Finding["alert_type"], campaign_id: string) =>
  ({
    alert_type,
    campaign_id,
    severity: "critical",
    campaign_name: null,
    details: {},
  }) satisfies Finding;

Deno.test(
  "resolveClearedAlerts closes only what the read no longer finds",
  async () => {
    const { db, calls } = fakeDb((call) =>
      call.op === "select"
        ? { data: OPEN, error: null }
        : { data: null, error: null },
    );
    const resolved = await resolveClearedAlerts(db, {
      tenantId: "t1",
      adAccountId: "act_1",
      findings: [finding("campaign_stopped", "c1")],
      now: NOW,
    });
    assertStrictEquals(resolved, 2);
    const [lookup, update] = calls;
    assertEquals(lookup.filters.slice(0, 2), [
      "tenant_id=t1",
      "ad_account_id=act_1",
    ]);
    assertStrictEquals(update.op, "update");
    assertEquals(update.values, { resolved_at: NOW.toISOString() });
    assertEquals(update.filters, ["id in a2,a3", "resolved_at is null"]);
  },
);

Deno.test(
  "resolveClearedAlerts closes nothing when the lookup fails",
  async () => {
    const { db, calls } = fakeDb(() => ({
      data: null,
      error: { message: "db down" },
    }));
    const realError = console.error;
    console.error = () => {};
    try {
      const resolved = await resolveClearedAlerts(db, {
        tenantId: "t1",
        adAccountId: "act_1",
        findings: [],
        now: NOW,
      });
      assertStrictEquals(resolved, 0);
    } finally {
      console.error = realError;
    }
    assertStrictEquals(calls.length, 1);
  },
);
