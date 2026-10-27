import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  handler,
  manusLine,
  manusStep,
  notifyBody,
  post,
  SERVICE_KEY,
  TENANT,
  tenantTables,
} from "./test-fixtures.ts";

const OTHER_TENANT = "99999999-9999-4999-8999-999999999999";

/** A primary manus_wa line of another tenant. */
const foreignLine = { ...manusLine("manus-foreign"), tenant_id: OTHER_TENANT };

/**
 * Carmen's first step names another tenant's line; a later step names none,
 * so it falls back to the tenant's own primary line.
 */
const tables = () =>
  tenantTables({
    steps: [
      manusStep("auto-1", "manus-foreign", "2026-01-01"),
      manusStep("auto-1", null, "2026-02-01"),
    ],
    integrations: [manusLine("manus-own"), foreignLine],
  });

/** tenant_can_use_integration that shares manus-foreign with TENANT when `shared`. */
const sharing = (shared: boolean) => ({
  tenant_can_use_integration: ({
    p_tenant_id,
    p_integration_id,
  }: Record<string, unknown>) =>
    shared && p_tenant_id === TENANT && p_integration_id === "manus-foreign",
});

Deno.test("loadLinesById", async (t) => {
  await t.step(
    "another tenant's line a step names is not used or read unless shared",
    async () => {
      const { handle, fetch, db } = handler({
        tables: tables(),
        rpc: sharing(false),
      });
      const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
      assertStrictEquals(out.sent, true);
      assertStrictEquals(out.integration_id, "manus-own");
      assertStrictEquals(fetch.calls[0].body.integrationId, "manus-own");
      const byId = db.queries.filter(
        (q) =>
          q.table === "tenant_integrations" &&
          q.filters.some(([op, col]) => op === "in" && col === "id"),
      );
      assertEquals(byId, []);

      const ping = await handle(
        post({ ping: true, tenant_id: TENANT }, SERVICE_KEY),
      );
      const [report] = (await ping.json()).tenants;
      assertEquals(report.skipped_lines, [
        {
          automation_id: "auto-1",
          integration_id: "manus-foreign",
          role: null,
          reason: "not_found",
        },
      ]);
    },
  );

  await t.step("a line shared with the tenant is used", async () => {
    const { handle, fetch } = handler({
      tables: tables(),
      rpc: sharing(true),
    });
    const out = await (await handle(post(notifyBody, SERVICE_KEY))).json();
    assertStrictEquals(out.sent, true);
    assertStrictEquals(out.integration_id, "manus-foreign");
    assertStrictEquals(fetch.calls[0].body.integrationId, "manus-foreign");
  });

  await t.step("a failed sharing lookup is a 500, not a skip", async () => {
    const { handle, fetch } = handler({
      tables: tables(),
      failing: { tenant_can_use_integration: "timeout" },
    });
    const res = await handle(post(notifyBody, SERVICE_KEY));
    assertStrictEquals(res.status, 500);
    assertStrictEquals(fetch.calls.length, 0);
  });
});
