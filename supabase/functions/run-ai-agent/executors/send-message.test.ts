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
        { actorUserId: "actor" },
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
  const f = executorClient([
    { phone: "0501234567", tenant_id: "t1" },
    new Response("denied", { status: 403 }),
  ]);
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
    const tenant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const actor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const f = executorClient(
      [{ phone: "0501234567", tenant_id: tenant }, [], false],
      200,
      { actorUserId: actor, accessibleTenantIds: ["t1", tenant] },
    );
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
    assertEquals(
      new URL(f.calls[1].url).searchParams.get("tenant_id"),
      "eq." + tenant,
    );
  },
);

Deno.test(
  "membership permits a shared-contact send without expanding endpoint policy",
  async () => {
    const tenant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const actor = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const f = executorClient(
      [
        { phone: "0501234567", tenant_id: tenant },
        [{ user_id: actor }],
        false,
        {},
      ],
      200,
      { actorUserId: actor },
    );
    await executeSendMessage(
      { contact_type: "client", contact_id: contactId, message_text: "hello" },
      f.context,
    );
    assertEquals(
      new URL(f.calls[3].url).pathname,
      "/functions/v1/send-green-api-message",
    );
  },
);
