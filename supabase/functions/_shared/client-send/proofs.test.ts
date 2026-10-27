import { assertEquals } from "jsr:@std/assert@1";
import {
  CLIENT,
  guardDb,
  OTHER_CLIENT,
  OTHER_TENANT,
  TENANT,
} from "./fake-guard-db.ts";
import { automationTarget, reportScheduleClient } from "./proofs.ts";

const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const OWN = "77777777-7777-4777-8777-777777777777";
const SHARED = "88888888-8888-4888-8888-888888888888";
const FLOW = "99999999-9999-4999-8999-999999999999";

const { db, writes } = guardDb({
  tables: {
    report_schedules: [
      { id: SCHEDULE, tenant_id: TENANT, enabled: true, client_id: CLIENT },
    ],
    automations: [
      {
        id: OWN,
        tenant_id: TENANT,
        active: true,
        is_flow: false,
        trigger_type: "lead_created",
        configuration: {},
        conditions: { client_id: CLIENT },
      },
      {
        id: SHARED,
        tenant_id: OTHER_TENANT,
        active: true,
        is_flow: false,
        trigger_type: "task_overdue",
        configuration: { client_id: OTHER_CLIENT },
        conditions: null,
      },
      {
        id: FLOW,
        tenant_id: TENANT,
        active: true,
        is_flow: true,
        trigger_type: "manual_command",
        configuration: {},
        conditions: null,
      },
    ],
    automation_shared_tenants: [{ automation_id: SHARED, tenant_id: TENANT }],
    automation_flow_steps: [
      {
        automation_id: FLOW,
        tenant_id: OTHER_TENANT,
        step_type: "trigger",
        sort_order: 0,
        action_type: "task_overdue",
        configuration: { client_id: OTHER_CLIENT },
      },
      {
        automation_id: FLOW,
        tenant_id: TENANT,
        step_type: "trigger",
        sort_order: 1,
        action_type: "inbound_webhook_lead",
        configuration: { client_id: CLIENT },
      },
    ],
  },
});

Deno.test("reportScheduleClient proves an enabled schedule here", async () => {
  const ask = (tenantId: string, scheduleId: string) =>
    reportScheduleClient(db, { tenantId, scheduleId });
  assertEquals(await ask(TENANT, SCHEDULE), CLIENT);
  assertEquals(await ask(OTHER_TENANT, SCHEDULE), null);
  assertEquals(await ask(TENANT, "not-a-uuid"), null);
});

Deno.test(
  "automationTarget proves an automation the tenant runs",
  async (t) => {
    const ask = (tenantId: string, automationId: string) =>
      automationTarget(db, { tenantId, automationId });

    await t.step("its own, with the client its conditions name", async () => {
      assertEquals(await ask(TENANT, OWN), {
        clientId: CLIENT,
        triggerType: "lead_created",
      });
    });

    await t.step("one shared into it from another tenant", async () => {
      assertEquals(await ask(TENANT, SHARED), {
        clientId: OTHER_CLIENT,
        triggerType: "task_overdue",
      });
    });

    await t.step("a flow, by its trigger step in its tenant", async () => {
      assertEquals(await ask(TENANT, FLOW), {
        clientId: CLIENT,
        triggerType: "inbound_webhook_lead",
      });
    });

    await t.step("not another tenant's, nor a non-uuid ref", async () => {
      assertEquals(await ask(OTHER_TENANT, OWN), null);
      assertEquals(await ask(TENANT, "automation-1"), null);
    });

    await t.step("not an inactive one", async () => {
      const inactive = guardDb({
        tables: {
          automations: [{ id: OWN, tenant_id: TENANT, active: false }],
        },
      });
      assertEquals(
        await automationTarget(inactive.db, {
          tenantId: TENANT,
          automationId: OWN,
        }),
        null,
      );
    });

    assertEquals(writes, []);
  },
);
