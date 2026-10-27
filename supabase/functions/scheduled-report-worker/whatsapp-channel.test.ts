import { assertEquals } from "jsr:@std/assert@1";
import type { ReportSender } from "../_shared/report-sender/types.ts";
import {
  type FunctionReply,
  type ScheduleForWhatsApp,
  sendScheduledWhatsApp,
  type WhatsAppChannelDeps,
} from "./whatsapp-channel.ts";

const TENANT = "tenant-dmm";
const CREATOR = "user-creator";

function sender(
  id: string,
  overrides: Partial<ReportSender> = {},
): ReportSender {
  return {
    id,
    integration_type: "green_api",
    display_name: null,
    last4: null,
    owner_user_id: "user-other",
    owner_name: null,
    owner_tenant_id: TENANT,
    owner_tenant_name: null,
    is_shared: false,
    carmen_role: null,
    ready: true,
    group_chat_ids: null,
    caller_can_manage: false,
    ...overrides,
  };
}

const carmen = sender("carmen", { integration_type: "manus_wa" });
const creatorGreen = sender("creator-green", { owner_user_id: CREATOR });
const officeGreen = sender("office-green");

const schedule: ScheduleForWhatsApp = {
  id: "schedule-1",
  tenant_id: TENANT,
  client_id: "client-1",
  created_by: CREATOR,
  whatsapp_integration_id: null,
  whatsapp_group_id: null,
  phone: null,
  clients: { whatsapp_group_id: "group-1", phone: "0501234567" },
};

type Call = { name: string; body: Record<string, unknown> };

/** Deps over fixed lines and default; records each function call. */
function deps(
  senders: ReportSender[],
  tenantDefault: string | null = null,
  reply: FunctionReply = { ok: true, status: 200, text: "{}" },
) {
  const calls: Call[] = [];
  const channel: WhatsAppChannelDeps = {
    listSenders: async (tenantId) => (tenantId === TENANT ? senders : []),
    tenantDefaultId: async () => tenantDefault,
    callFunction: async (name, body) => {
      calls.push({ name, body });
      return reply;
    },
  };
  return { calls, channel };
}

Deno.test("sendScheduledWhatsApp picks the line", async (t) => {
  const all = [carmen, creatorGreen, officeGreen];

  await t.step("the schedule's own line first", async () => {
    const { calls, channel } = deps(all, "carmen");
    const result = await sendScheduledWhatsApp(
      channel,
      { ...schedule, whatsapp_integration_id: "office-green" },
      "msg",
    );
    assertEquals(result.sender, {
      integration_id: "office-green",
      type: "green_api",
      source: "schedule",
    });
    assertEquals(calls[0].name, "send-green-api-message");
    assertEquals(calls[0].body.integrationId, "office-green");
  });

  await t.step("then the tenant default", async () => {
    const { calls, channel } = deps(all, "carmen");
    const result = await sendScheduledWhatsApp(channel, schedule, "msg");
    assertEquals(result.sender?.source, "tenant_default");
    assertEquals(calls[0].name, "send-manus-wa-message");
  });

  await t.step(
    "then the only line: a Manus-only tenant sends from Carmen",
    async () => {
      const { calls, channel } = deps([carmen]);
      const result = await sendScheduledWhatsApp(
        channel,
        schedule,
        "הדוח מוכן",
      );
      assertEquals(result, {
        ok: true,
        sender: {
          integration_id: "carmen",
          type: "manus_wa",
          source: "only_sender",
        },
      });
      assertEquals(calls, [
        {
          name: "send-manus-wa-message",
          body: {
            clientId: "client-1",
            tenantId: TENANT,
            groupId: "group-1",
            phoneNumber: "0501234567",
            message: "הדוח מוכן",
            senderUserId: CREATOR,
            integrationId: "carmen",
            sendKind: "report",
            sendRef: "schedule-1",
          },
        },
      ]);
    },
  );

  await t.step("then the creator's own Green API line, as before", async () => {
    const { calls, channel } = deps(all);
    const result = await sendScheduledWhatsApp(channel, schedule, "msg");
    assertEquals(result.sender?.source, "own_line");
    assertEquals(calls[0].body.integrationId, "creator-green");
  });
});

Deno.test(
  "sendScheduledWhatsApp fails the channel without sending",
  async (t) => {
    await t.step("no line at all", async () => {
      const { calls, channel } = deps([]);
      assertEquals(await sendScheduledWhatsApp(channel, schedule, "msg"), {
        ok: false,
        error: "no_report_sender",
      });
      assertEquals(calls.length, 0);
    });

    await t.step("a schedule line the tenant may no longer use", async () => {
      const { calls, channel } = deps([carmen]);
      const result = await sendScheduledWhatsApp(
        channel,
        { ...schedule, whatsapp_integration_id: "foreign-line" },
        "msg",
      );
      assertEquals(result, { ok: false, error: "sender_not_allowed" });
      assertEquals(calls.length, 0);
    });

    await t.step("a schedule without an owner", async () => {
      const { calls, channel } = deps([carmen]);
      const result = await sendScheduledWhatsApp(
        channel,
        { ...schedule, created_by: null },
        "msg",
      );
      assertEquals(result.ok, false);
      assertEquals(calls.length, 0);
    });
  },
);

Deno.test("sendScheduledWhatsApp reports what the sender said", async () => {
  const unknown = deps([carmen], null, { ok: true, status: 202, text: "{}" });
  assertEquals(
    (await sendScheduledWhatsApp(unknown.channel, schedule, "msg")).error,
    "delivery_unknown",
  );
  const refused = deps([carmen], null, {
    ok: false,
    status: 403,
    text: '{"error":"blocked_by_staging_safe_mode"}',
  });
  const result = await sendScheduledWhatsApp(refused.channel, schedule, "msg");
  assertEquals(result.ok, false);
  assertEquals(result.error, '{"error":"blocked_by_staging_safe_mode"}');
  assertEquals(result.sender?.integration_id, "carmen");
});
