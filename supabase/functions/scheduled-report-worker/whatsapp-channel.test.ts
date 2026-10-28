import { assertEquals } from "jsr:@std/assert@1";
import { reportSender } from "../_shared/report-sender/fixture.ts";
import type { ReportSender } from "../_shared/report-sender/types.ts";
import {
  type FunctionReply,
  type ScheduleForWhatsApp,
  sendScheduledWhatsApp,
  type WhatsAppChannelDeps,
} from "./whatsapp-channel.ts";

const TENANT = "tenant-dmm";
const CREATOR = "user-creator";

/**
 * A line of the schedule's tenant, owned by another member and open to
 * everyone unless overridden.
 */
function sender(
  id: string,
  overrides: Partial<ReportSender> = {},
): ReportSender {
  return reportSender(id, {
    owner_user_id: "user-other",
    owner_tenant_id: TENANT,
    ...overrides,
  });
}

const carmen = sender("carmen", { integration_type: "manus_wa" });
const creatorGreen = sender("creator-green", {
  owner_user_id: CREATOR,
  org_wide: false,
});
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

/**
 * Deps over fixed lines and default; records each function call. The list
 * keeps list_report_whatsapp_senders' privacy rule: a line open to everyone,
 * or one the asking user owns.
 */
function deps(
  senders: ReportSender[],
  tenantDefault: string | null = null,
  reply: FunctionReply = { ok: true, status: 200, text: "{}" },
) {
  const calls: Call[] = [];
  const channel: WhatsAppChannelDeps = {
    listSenders: async (tenantId, userId) =>
      tenantId === TENANT
        ? senders.filter(
            (line) => line.org_wide || line.owner_user_id === userId,
          )
        : [],
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

  await t.step(
    "a legacy schedule keeps the creator's line after a default is set",
    async () => {
      // 20261027104000 pinned it to the creator's own Green API line.
      const { calls, channel } = deps(all, "carmen");
      const result = await sendScheduledWhatsApp(
        channel,
        { ...schedule, whatsapp_integration_id: "creator-green" },
        "msg",
      );
      assertEquals(result.sender, {
        integration_id: "creator-green",
        type: "green_api",
        source: "schedule",
      });
      assertEquals(calls[0].name, "send-green-api-message");
    },
  );
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

    await t.step(
      "a default whose line was switched off or unshared",
      async () => {
        // list_report_whatsapp_senders no longer returns the default line.
        const { calls, channel } = deps([carmen], "office-green");
        const result = await sendScheduledWhatsApp(channel, schedule, "msg");
        assertEquals(result, { ok: false, error: "sender_not_allowed" });
        assertEquals(calls.length, 0);
      },
    );

    await t.step("only another member's private line", async () => {
      // Member A's own Green API line, never opened to the organization:
      // creator B's report must not go out from A's WhatsApp.
      const memberALine = sender("member-a", { org_wide: false });
      const { calls, channel } = deps([memberALine]);
      const result = await sendScheduledWhatsApp(channel, schedule, "msg");
      assertEquals(result, { ok: false, error: "no_report_sender" });
      assertEquals(calls.length, 0);
    });

    await t.step(
      "a schedule pinned to another member's private line",
      async () => {
        const memberALine = sender("member-a", { org_wide: false });
        const { calls, channel } = deps([memberALine, carmen]);
        const result = await sendScheduledWhatsApp(
          channel,
          { ...schedule, whatsapp_integration_id: "member-a" },
          "msg",
        );
        assertEquals(result, { ok: false, error: "sender_not_allowed" });
        assertEquals(calls.length, 0);
      },
    );

    await t.step("only a line shared by another tenant", async () => {
      const shared = sender("shared", {
        integration_type: "manus_wa",
        is_shared: true,
      });
      const { calls, channel } = deps([shared]);
      const result = await sendScheduledWhatsApp(channel, schedule, "msg");
      assertEquals(result, { ok: false, error: "choose_sender" });
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
