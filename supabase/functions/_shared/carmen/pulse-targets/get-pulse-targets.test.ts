import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

import { at } from "../../pulse/test-fixtures.ts";
import { fakeDb } from "./fake-db.ts";
import { getPulseTargets } from "./get-pulse-targets.ts";
import { RATIONALE, ctx, seed } from "./test-fixtures.ts";

Deno.test(
  "get_pulse_targets shows sources and the spending campaigns without one",
  async () => {
    const db = fakeDb(
      seed({
        pulse_platform_targets: {
          ecommerce: {
            roas: 3,
            source: "carmen_market",
            rationale: RATIONALE,
            set_at: "2026-10-20T08:00:00Z",
          },
        },
      }),
    );
    const result = await getPulseTargets(db, ctx(), { client_id: "client-1" });
    const client = at(result, "clients", "0");
    assertStrictEquals(at(client, "client_name"), "שיפוצי אבי");
    assertStrictEquals(
      at(client, "platform_targets", "0", "source"),
      "carmen_market",
    );
    assertStrictEquals(
      at(client, "platform_targets", "0", "set_at"),
      "2026-10-20T08:00:00Z",
    );
    assertStrictEquals(at(result, "missing_count"), 1);
    assertStrictEquals(
      at(client, "missing", "0", "campaigns", "0", "campaign_id"),
      "c1",
    );
  },
);

Deno.test(
  "client names are read in the caller's tenants, and a failed read throws",
  async () => {
    const db = fakeDb(seed());
    db.tables.clients[0].tenant_id = "tenant-2";
    const result = await getPulseTargets(db, ctx(), { client_id: "client-1" });
    assertStrictEquals(at(result, "clients", "0", "client_name"), null);

    const failing = fakeDb(seed(), { table: "clients", op: "select" });
    await assertRejects(
      () => getPulseTargets(failing, ctx(), { client_id: "client-1" }),
      Error,
      "clients select failed",
    );
  },
);

Deno.test("a caller with no client scope must name a client", async () => {
  const result = await getPulseTargets(
    fakeDb(seed()),
    ctx({ isManagerRole: false, callerRole: "campaigner" }),
    {},
  );
  assertEquals(result, { error: "ציינו client_id — אין לך שיוך ללקוחות" });
});

Deno.test("a read cut by its cap says the answer is partial", async () => {
  const tables = seed();
  const [metaTable] = tables.crm_tables;
  tables.crm_tables = Array.from({ length: 501 }, (_, i) => ({
    ...metaTable,
    id: `t-${i}`,
    client_id: `client-${i}`,
  }));
  const result = await getPulseTargets(fakeDb(tables), ctx(), {});
  assertStrictEquals(at(result, "truncated"), true);
  assertStringIncludes(String(at(result, "note")), "התשובה חלקית");

  const whole = await getPulseTargets(fakeDb(seed()), ctx(), {});
  assertStrictEquals(at(whole, "truncated"), false);
  assertStrictEquals(at(whole, "note"), undefined);
});
