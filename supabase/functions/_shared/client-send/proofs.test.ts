import { assertEquals } from "jsr:@std/assert@1";
import { fakeDb } from "../broadcast/fake-db.ts";
import { CLIENT, OTHER_CLIENT, OTHER_TENANT, TENANT } from "./fake-guard-db.ts";
import {
  automationTarget,
  broadcastIsSending,
  reportScheduleClient,
} from "./proofs.ts";

const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const BROADCAST = "66666666-6666-4666-8666-666666666666";
const OWN = "77777777-7777-4777-8777-777777777777";
const SHARED = "88888888-8888-4888-8888-888888888888";
const FLOW = "99999999-9999-4999-8999-999999999999";

const { db, writes } = fakeDb({
  report_schedules: [
    { id: SCHEDULE, tenant_id: TENANT, enabled: true, client_id: CLIENT },
  ],
  broadcasts: [{ id: BROADCAST, tenant_id: TENANT, status: "sending" }],
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
      step_type: "trigger",
      sort_order: 0,
      action_type: "inbound_webhook_lead",
      configuration: { client_id: CLIENT },
    },
  ],
});

Deno.test("reportScheduleClient proves an enabled schedule here", async () => {
  const ask = (tenantId: string, scheduleId: string) =>
    reportScheduleClient(db, { tenantId, scheduleId });
  assertEquals(await ask(TENANT, SCHEDULE), CLIENT);
  assertEquals(await ask(OTHER_TENANT, SCHEDULE), null);
  assertEquals(await ask(TENANT, "not-a-uuid"), null);
});

Deno.test(
  "broadcastIsSending proves a broadcast being dispatched",
  async () => {
    const ask = (tenantId: string, broadcastId: string) =>
      broadcastIsSending(db, { tenantId, broadcastId });
    assertEquals(await ask(TENANT, BROADCAST), true);
    assertEquals(await ask(OTHER_TENANT, BROADCAST), false);
    assertEquals(await ask(TENANT, "draft"), false);
    const paused = fakeDb({
      broadcasts: [{ id: BROADCAST, tenant_id: TENANT, status: "paused" }],
    });
    assertEquals(
      await broadcastIsSending(paused.db, {
        tenantId: TENANT,
        broadcastId: BROADCAST,
      }),
      false,
    );
  },
);

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

    await t.step("a flow, by its trigger step", async () => {
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
      const inactive = fakeDb({
        automations: [{ id: OWN, tenant_id: TENANT, active: false }],
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
