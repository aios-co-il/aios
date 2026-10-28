import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { graphAccountId, loadReportAccounts } from "./report-accounts.ts";
import { fakeDb } from "./tests/fake-db.ts";

const TABLES = [
  // Active report, bare id and a stored connection.
  {
    id: "t1",
    client_id: "c-roma",
    campaign_active: true,
    integration_settings: { ad_account_id: "111", integration_id: "int-1" },
  },
  // Report switched off: its account is not watched.
  {
    id: "t2",
    client_id: "c-off",
    campaign_active: false,
    integration_settings: { ad_account_id: "act_222" },
  },
  // No ad account configured.
  {
    id: "t3",
    client_id: "c-roma",
    campaign_active: null,
    integration_settings: {},
  },
  // Second table of the same client on the same account.
  {
    id: "t4",
    client_id: "c-roma",
    campaign_active: null,
    integration_settings: { ad_account_id: "act_111" },
  },
];

Deno.test(
  "loadReportAccounts: active reports' accounts, one per account",
  async () => {
    const { db, calls } = fakeDb((call) =>
      call.table === "crm_tables"
        ? { data: TABLES, error: null }
        : { data: [{ id: "c-roma", name: "פיצה רומא" }], error: null },
    );
    const accounts = await loadReportAccounts(db, "tenant-1");
    assertEquals(accounts, [
      {
        adAccountId: "act_111",
        clientId: "c-roma",
        clientName: "פיצה רומא",
        integrationId: "int-1",
      },
    ]);
    assertEquals(calls[0].filters, [
      "tenant_id=tenant-1",
      "integration_type in facebook_insights,facebook_ecommerce",
      "client_id not is null",
    ]);
    assertEquals(calls[1].filters, ["id in c-roma"]);
  },
);

Deno.test("loadReportAccounts: no active report reads no clients", async () => {
  const { db, calls } = fakeDb(() => ({ data: [TABLES[1]], error: null }));
  assertEquals(await loadReportAccounts(db, "tenant-1"), []);
  assertStrictEquals(calls.length, 1);
});

Deno.test("graphAccountId adds act_ once", () => {
  assertStrictEquals(graphAccountId("123"), "act_123");
  assertStrictEquals(graphAccountId(" act_123 "), "act_123");
  assertStrictEquals(graphAccountId(123), "act_123");
  assertStrictEquals(graphAccountId(""), null);
  assertStrictEquals(graphAccountId(null), null);
});
