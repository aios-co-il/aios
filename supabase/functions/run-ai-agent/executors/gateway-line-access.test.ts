import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executorClient } from "./executor-client.test-fixture.ts";
import { executeGetWhatsappQrLink } from "./get-whatsapp-qr-link.ts";
import { executeGetWhatsappStatus } from "./get-whatsapp-status.ts";
import { executeSendWhatsappViaGateway } from "./send-whatsapp-via-gateway.ts";

const tenantId = "11111111-1111-4111-8111-111111111111";
const integrationId = "22222222-2222-4222-8222-222222222222";

for (const [name, invoke] of Object.entries({
  qr: (context: ReturnType<typeof executorClient>["context"]) =>
    executeGetWhatsappQrLink({ integrationId }, context),
  status: (context: ReturnType<typeof executorClient>["context"]) =>
    executeGetWhatsappStatus({ integrationId }, context),
  send: (context: ReturnType<typeof executorClient>["context"]) =>
    executeSendWhatsappViaGateway(
      { integrationId, phone: "test-phone", message: "test" },
      context,
    ),
})) {
  Deno.test(
    `${name} refuses a foreign integration before gateway invocation`,
    async () => {
      const fixture = executorClient([null, false], 200, { tenantId });
      await assertRejects(
        () => invoke(fixture.context),
        Error,
        "integration_not_authorized",
      );
      assertEquals(
        fixture.calls.some((call) => call.url.includes("/functions/")),
        false,
      );
      const lookup = new URL(fixture.calls[0].url);
      assertEquals(lookup.searchParams.get("tenant_id"), `eq.${tenantId}`);
      assertEquals(lookup.searchParams.get("id"), `eq.${integrationId}`);
    },
  );

  Deno.test(`${name} preserves the own-tenant gateway request`, async () => {
    const fixture = executorClient(
      [{ id: integrationId }, { success: true }],
      200,
      { tenantId },
    );
    assertEquals(await invoke(fixture.context), { success: true });
    assertEquals(
      fixture.calls[1].url.endsWith("/functions/v1/manage-manus-wa"),
      true,
    );
    assertEquals(fixture.calls[1].body, {
      action:
        name === "qr"
          ? "get_qr_link"
          : name === "status"
            ? "get_status"
            : "send_message",
      integrationId,
      ...(name === "send" ? { phone: "test-phone", message: "test" } : {}),
    });
  });
}

Deno.test(
  "gateway sending accepts an explicitly shared line through the existing policy",
  async () => {
    const fixture = executorClient([null, true, { success: true }], 200, {
      tenantId,
    });
    assertEquals(
      await executeSendWhatsappViaGateway(
        { integrationId, phone: "test-phone", message: "test" },
        fixture.context,
      ),
      { success: true },
    );
    assertEquals(fixture.calls[1].body, {
      p_tenant_id: tenantId,
      p_integration_id: integrationId,
    });
  },
);

Deno.test("failed integration lookup cannot invoke the gateway", async () => {
  const fixture = executorClient([{ message: "lookup failed" }], 500, {
    tenantId,
  });
  await assertRejects(() =>
    executeGetWhatsappStatus({ integrationId }, fixture.context),
  );
  assertEquals(fixture.calls.length, 1);
});

Deno.test(
  "gateway HTTP failures preserve the public error response after authorization",
  async () => {
    const fixture = executorClient(
      [
        { id: integrationId },
        new Response(JSON.stringify({ error: "provider failed" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ],
      200,
      { tenantId },
    );
    assertEquals(
      await executeGetWhatsappStatus({ integrationId }, fixture.context),
      { error: "provider failed" },
    );
  },
);

Deno.test(
  "a failed sharing policy lookup cannot authorize a send",
  async () => {
    const fixture = executorClient(
      [
        null,
        new Response(JSON.stringify({ message: "policy failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ],
      200,
      { tenantId },
    );
    await assertRejects(
      () =>
        executeSendWhatsappViaGateway(
          { integrationId, phone: "test-phone", message: "test" },
          fixture.context,
        ),
      Error,
      "tenant_can_use_integration failed",
    );
    assertEquals(
      fixture.calls.some((call) => call.url.includes("/functions/")),
      false,
    );
  },
);
