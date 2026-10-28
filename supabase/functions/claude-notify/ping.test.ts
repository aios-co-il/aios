import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  greenLine,
  greenStep,
  handler,
  manusLine,
  manusStep,
  post,
  SERVICE_KEY,
  TENANT,
  tenantTables,
  withRole,
} from "./test-fixtures.ts";

Deno.test("claude-notify ping", async (t) => {
  await t.step(
    "reports the step and line role per tenant and sends nothing",
    async () => {
      const { handle, fetch } = handler({
        tables: tenantTables({
          steps: [greenStep("auto-1"), manusStep("auto-1", "manus-1")],
          integrations: [manusLine("manus-1", false), greenLine()],
        }),
      });
      const res = await handle(post({ ping: true }, SERVICE_KEY));
      const out = await res.json();
      assertStrictEquals(res.status, 200);
      assertStrictEquals(out.ping, true);
      assertStrictEquals(out.sent, false);
      assertEquals(out.tenants, [
        {
          tenant_id: TENANT,
          transport: "green_fallback",
          step_type: "send_green_api_message",
          automation_id: "auto-1",
          integration_id: "green-1",
          integration_role: "primary",
          integration_primary: true,
          manus_integration_active: false,
          active_manus_integrations: 0,
          primary_manus_integrations: 0,
          skipped_lines: [
            {
              automation_id: "auto-1",
              integration_id: "manus-1",
              role: "primary",
              reason: "inactive",
            },
          ],
          recipient_source: "campaign_pulse_phone",
          sender_resolved: true,
          reason: "manus_integration_inactive",
        },
      ]);
      assertStrictEquals(fetch.calls.length, 0);
      assertStrictEquals((await handle(post({ ping: true }))).status, 401);
    },
  );

  await t.step(
    "shows a secondary-only tenant as refused, with the skipped line's role",
    async () => {
      const { handle, fetch } = handler({
        tables: tenantTables({
          steps: [manusStep("auto-1", "manus-owner")],
          integrations: [withRole(manusLine("manus-owner"), "secondary")],
        }),
      });
      const out = await (
        await handle(post({ ping: true, tenant_id: TENANT }, SERVICE_KEY))
      ).json();
      const [tenant] = out.tenants;
      assertStrictEquals(tenant.transport, "none");
      assertStrictEquals(tenant.integration_role, null);
      assertStrictEquals(tenant.integration_primary, false);
      assertStrictEquals(tenant.active_manus_integrations, 1);
      assertStrictEquals(tenant.primary_manus_integrations, 0);
      assertEquals(tenant.skipped_lines, [
        {
          automation_id: "auto-1",
          integration_id: "manus-owner",
          role: "secondary",
          reason: "not_primary",
        },
      ]);
      assertStrictEquals(tenant.reason, "manus_line_not_primary");
      assertStrictEquals(fetch.calls.length, 0);
    },
  );

  await t.step(
    "a failed tenant listing is a 500, not an empty report",
    async () => {
      const { handle } = handler({
        failing: { tenant_heartbeat_settings: "statement timeout" },
      });
      const res = await handle(post({ ping: true }, SERVICE_KEY));
      assertStrictEquals(res.status, 500);
      assertStrictEquals((await res.json()).error, "internal error");
    },
  );
});
