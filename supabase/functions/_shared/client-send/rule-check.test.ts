import { assertEquals } from "jsr:@std/assert@1";
import {
  CLIENT,
  guardDb,
  OTHER_CLIENT,
  OTHER_TENANT,
  optInKey,
  TENANT,
} from "./fake-guard-db.ts";
import { clientRefusal } from "./rule-check.ts";
import type { ClientSendRequest, SendRecipient } from "./types.ts";

const SCHEDULE = "55555555-5555-4555-8555-555555555555";
const BROADCAST = "66666666-6666-4666-8666-666666666666";
const FOR_CLIENT = "77777777-7777-4777-8777-777777777777";
const TENANT_WIDE = "88888888-8888-4888-8888-888888888888";

const tables = {
  report_schedules: [
    { id: SCHEDULE, tenant_id: TENANT, enabled: true, client_id: CLIENT },
  ],
  broadcasts: [{ id: BROADCAST, tenant_id: TENANT, status: "paused" }],
  automations: [
    automation(FOR_CLIENT, "task_overdue", { client_id: CLIENT }),
    automation(TENANT_WIDE, "lead_created", {}),
  ],
};

function automation(id: string, trigger: string, conditions: object) {
  return {
    id,
    tenant_id: TENANT,
    active: true,
    is_flow: false,
    trigger_type: trigger,
    configuration: {},
    conditions,
  };
}

const send = (fields: Partial<ClientSendRequest>): ClientSendRequest => ({
  functionName: "send-green-api-message",
  tenantId: TENANT,
  channel: "whatsapp",
  address: "120363416882903532@g.us",
  origin: "system",
  sendKind: null,
  sendRef: null,
  subjectClientId: CLIENT,
  ...fields,
});

const group = (clientIds: string[]): SendRecipient => ({
  kind: "client_group",
  clientIds,
  leadId: null,
  groupId: "group-1",
  ambiguous: clientIds.length > 1,
});

/** The refusal for this send to this recipient, over the fixture tables. */
async function refusal(
  fields: Partial<ClientSendRequest>,
  recipient: SendRecipient = group([CLIENT]),
  optIns: string[] = [],
) {
  const { db } = guardDb({ tables, optIns });
  return await clientRefusal(db, send(fields), recipient);
}

Deno.test("kinds a client never gets automatically", async () => {
  assertEquals(await refusal({}), "unclassified_service_send");
  assertEquals(await refusal({ sendKind: "staff_alert" }), "staff_only");
  for (const sendKind of [
    "chat",
    "dashboard_share",
    "meeting_summary",
  ] as const) {
    assertEquals(await refusal({ sendKind }), "person_only_kind", sendKind);
  }
  assertEquals(await refusal({ sendKind: "carmen" }), "carmen_unverified");
});

Deno.test("a report needs its schedule, for this client", async () => {
  const report = { sendKind: "report" as const, sendRef: SCHEDULE };
  assertEquals(await refusal(report), null);
  assertEquals(
    await refusal(report, group([OTHER_CLIENT, CLIENT])),
    null,
    "a group shared with another client still gets its own report",
  );
  assertEquals(
    await refusal(report, group([OTHER_CLIENT])),
    "subject_mismatch",
  );
  assertEquals(await refusal({ ...report, sendRef: null }), "proof_missing");
  assertEquals(
    await refusal({ ...report, tenantId: OTHER_TENANT }),
    "proof_invalid",
  );
});

Deno.test("a broadcast needs to be dispatching", async () => {
  const broadcast = { sendKind: "broadcast" as const, sendRef: BROADCAST };
  assertEquals(await refusal(broadcast), "proof_invalid");
  assertEquals(await refusal({ ...broadcast, sendRef: null }), "proof_missing");
  const { db } = guardDb({
    tables: {
      broadcasts: [{ id: BROADCAST, tenant_id: TENANT, status: "sending" }],
    },
  });
  assertEquals(await clientRefusal(db, send(broadcast), group([CLIENT])), null);
});

Deno.test(
  "an automation passes for its client or by the card's switch",
  async (t) => {
    const run = (sendRef: string | null) => ({
      sendKind: "automation" as const,
      sendRef,
    });
    const leadAlertsToGroup = optInKey(CLIENT, "lead_alert", "whatsapp_group");

    await t.step("without its id, observed until AIO-267", async () => {
      assertEquals(await refusal(run(null)), "automation_without_ref");
    });

    await t.step("set for this client", async () => {
      assertEquals(await refusal(run(FOR_CLIENT)), null);
    });

    await t.step("not one this tenant runs", async () => {
      assertEquals(await refusal(run(SCHEDULE)), "proof_invalid");
    });

    await t.step("tenant-wide, only with the card's switch", async () => {
      assertEquals(await refusal(run(TENANT_WIDE)), "not_opted_in");
      assertEquals(
        await refusal(run(TENANT_WIDE), group([CLIENT]), [leadAlertsToGroup]),
        null,
      );
    });

    await t.step("tenant-wide, about this recipient's one client", async () => {
      const optIns = [leadAlertsToGroup];
      assertEquals(
        await refusal(
          { ...run(TENANT_WIDE), subjectClientId: null },
          undefined,
          optIns,
        ),
        "no_subject",
      );
      assertEquals(
        await refusal(run(TENANT_WIDE), group([OTHER_CLIENT]), optIns),
        "subject_mismatch",
      );
      assertEquals(
        await refusal(run(TENANT_WIDE), group([CLIENT, OTHER_CLIENT]), optIns),
        "ambiguous_group",
      );
    });

    await t.step("Telegram has no switch to turn on", async () => {
      assertEquals(
        await refusal(
          { ...run(TENANT_WIDE), channel: "telegram" },
          {
            ...group([CLIENT]),
            kind: "client",
          },
        ),
        "not_opted_in",
      );
    });
  },
);
