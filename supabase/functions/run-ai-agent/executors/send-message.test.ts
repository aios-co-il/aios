import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeSendMessage } from "./send-message.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

const contactId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

Deno.test(
  "send_message uses resolved tenant, handler recipient fields, and verified actor",
  async () => {
    for (const contact_type of ["client", "lead"]) {
      if (contact_type !== "client" && contact_type !== "lead") {
        throw new Error("unexpected contact");
      }
      const f = executorClient(
        [
          {
            phone: "0501234567",
            name: "client",
            company_name: "lead",
            tenant_id: "t1",
          },
          {},
        ],
        200,
        { actorUserId: "actor", approval: { outOfBand: true } },
      );
      await executeSendMessage(
        { contact_type, contact_id: contactId, message_text: "hello" },
        f.context,
      );
      assertEquals(
        new URL(f.calls[1].url).pathname,
        "/functions/v1/send-green-api-message",
      );
      assertEquals(f.calls[1].body, {
        phoneNumber: "0501234567",
        message: "hello",
        tenantId: "t1",
        senderUserId: "actor",
        ...(contact_type === "client"
          ? { clientId: contactId }
          : { leadId: contactId }),
      });
    }
  },
);

Deno.test("missing scoped contact performs no send", async () => {
  const f = executorClient([null]);
  await executeSendMessage(
    { contact_type: "client", contact_id: contactId, message_text: "hello" },
    f.context,
  );
  assertEquals(f.calls.length, 1);
});

Deno.test("send_message retains the raw HTTP error", async () => {
  const f = executorClient(
    [
      { phone: "0501234567", tenant_id: "t1" },
      new Response("denied", { status: 403 }),
    ],
    200,
    { approval: { outOfBand: true } },
  );
  await assertRejects(
    () =>
      executeSendMessage(
        {
          contact_type: "client",
          contact_id: contactId,
          message_text: "hello",
        },
        f.context,
      ),
    Error,
    "denied",
  );
});

Deno.test(
  "shared contacts require membership before invoking a sender",
  async () => {
    const { f, tenant } = sharedContactFixture(false);
    const result = await executeSendMessage(
      { contact_type: "client", contact_id: contactId, message_text: "hello" },
      f.context,
    );
    assertEquals(result, {
      success: false,
      error: "shared_tenant_send_not_authorized",
    });
    assertEquals(
      f.calls.some((call) => call.url.includes("/functions/v1/")),
      false,
    );
    const membership = f.calls.find((call) =>
      new URL(call.url).pathname.endsWith("/tenant_users"),
    );
    if (!membership) {
      throw new Error("Missing membership lookup");
    }
    assertEquals(
      new URL(membership.url).searchParams.get("tenant_id"),
      "eq." + tenant,
    );
  },
);

Deno.test(
  "membership permits a shared-contact send without expanding endpoint policy",
  async () => {
    const { f, tenant } = sharedContactFixture(true);
    const result = await executeSendMessage(
      { contact_type: "client", contact_id: contactId, message_text: "hello" },
      f.context,
    );
    const sent = f.calls.find(
      (call) =>
        new URL(call.url).pathname === "/functions/v1/send-green-api-message",
    );
    if (!sent) {
      throw new Error("Missing send invocation");
    }
    assertEquals(sent.body, {
      phoneNumber: "0501234567",
      message: "hello",
      tenantId: tenant,
      senderUserId: f.context.actorUserId,
      clientId: contactId,
    });
    assertEquals("sent_to" in result, true);
  },
);

Deno.test(
  "in a chat send_message queues the message for approval and sends nothing",
  async () => {
    const f = executorClient(
      [
        { phone: "0501234567", contact_name: "דני", tenant_id: "t1" },
        { id: "approval-1" },
      ],
      200,
      { actorUserId: "actor", agentId: "agent-1" },
    );
    const result = await executeSendMessage(
      { contact_type: "lead", contact_id: contactId, message_text: "hello" },
      f.context,
    );
    assertEquals(
      f.calls.some((call) => call.url.includes("/functions/v1/")),
      false,
    );
    assertEquals(
      new URL(f.calls[1].url).pathname,
      "/rest/v1/agent_approval_queue",
    );
    const row = f.calls[1].body as Record<string, unknown>;
    assertEquals(
      {
        tenant_id: row.tenant_id,
        agent_id: row.agent_id,
        requested_by: row.requested_by,
        action_type: row.action_type,
        tool_name: row.tool_name,
        tool_input: row.tool_input,
        status: row.status,
      },
      {
        tenant_id: "t1",
        agent_id: "agent-1",
        requested_by: "actor",
        action_type: "agent_direct_tool",
        tool_name: "send_message",
        tool_input: {
          contact_type: "lead",
          contact_id: contactId,
          message_text: "hello",
        },
        status: "pending",
      },
    );
    assertEquals("pending_approval" in result && result.pending_approval, true);
    assertEquals("approval_id" in result && result.approval_id, "approval-1");
  },
);

Deno.test("a chat send without a requester queues nothing", async () => {
  const f = executorClient([{ phone: "0501234567", tenant_id: "t1" }]);
  const result = await executeSendMessage(
    { contact_type: "client", contact_id: contactId, message_text: "hello" },
    f.context,
  );
  assertEquals(result, {
    success: false,
    error: "send_message_requires_requester",
  });
  assertEquals(f.calls.length, 1);
});

/** Route parallel access lookups by endpoint, independent of SDK scheduling. */
function sharedContactFixture(member: boolean) {
  const tenant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const actor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const f = executorClient(
    [],
    200,
    {
      actorUserId: actor,
      accessibleTenantIds: ["t1", tenant],
      approval: { outOfBand: true },
    },
    undefined,
    (url) => {
      if (url.pathname === "/rest/v1/clients") {
        return { phone: "0501234567", name: "Contact", tenant_id: tenant };
      }
      if (url.pathname === "/rest/v1/tenant_users") {
        return member ? [{ user_id: actor }] : [];
      }
      if (url.pathname === "/rest/v1/rpc/is_super_admin") {
        return false;
      }
      if (url.pathname === "/functions/v1/send-green-api-message") {
        return {};
      }
      throw new Error(`Unexpected shared-contact request: ${url.pathname}`);
    },
  );
  return { f, tenant };
}
