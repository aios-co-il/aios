// The client send guard in this handler (AIO-261): a refused send never
// reaches Green API, an observed one does.
import { assertEquals } from "jsr:@std/assert@1";
import {
  CLIENT,
  resolved,
  type ResolverRow,
  TENANT,
} from "../_shared/client-send/fake-guard-db.ts";
import {
  callServedHandler,
  loadServedHandler,
  SERVICE_ROLE_KEY,
} from "../_shared/client-send/served-handler.ts";

const SENDER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const handler = await loadServedHandler(new URL("./index.ts", import.meta.url));

/** A send to a phone (service role by default), with the resolver's answer. */
function send(
  body: Record<string, unknown>,
  recipient: ResolverRow,
  token = SERVICE_ROLE_KEY,
) {
  const request = new Request("http://functions.test/send-green-api-message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tenantId: TENANT,
      senderUserId: SENDER,
      phoneNumber: "050-1234567",
      message: "שלום",
      ...body,
    }),
  });
  return callServedHandler(
    handler,
    request,
    {
      "GET /auth/v1/user": { id: SENDER },
      "GET /tenant_users": [{ user_id: SENDER }],
      "POST /rpc/is_super_admin": false,
      "GET /tenant_integrations": [
        {
          id: "line-1",
          tenant_id: TENANT,
          user_id: SENDER,
          api_key: "token",
          settings: { instance_id: "1101" },
        },
      ],
      "POST /rpc/resolve_send_recipient": [recipient],
    },
    { idMessage: "green-1" },
  );
}

/** The refusal rows the handler wrote. */
const refusals = (rest: { path: string; body: unknown }[]) =>
  rest.filter((call) => call.path === "/client_send_refusals");

Deno.test(
  "send-green-api-message refuses a staff alert to a client",
  async () => {
    const { response, provider, rest } = await send(
      { sendKind: "staff_alert", clientId: CLIENT },
      resolved("client", [CLIENT]),
    );
    assertEquals(response.status, 403);
    assertEquals(await response.json(), {
      error: "client_send_not_authorized",
      reason: "staff_only",
    });
    assertEquals(provider, []);
    assertEquals(refusals(rest).length, 1);
    const resolverCall = rest.find(
      (call) => call.path === "/rpc/resolve_send_recipient",
    );
    assertEquals(resolverCall?.body, {
      p_tenant_id: TENANT,
      p_shape: "phone",
      p_address: "972501234567",
    });
  },
);

Deno.test("send-green-api-message still sends an observed send", async () => {
  const { response, provider, rest } = await send(
    {},
    resolved("client", [CLIENT]),
  );
  assertEquals(response.status, 200);
  assertEquals(provider.length, 1);
  assertEquals(
    provider[0].path,
    "https://api.green-api.com/waInstance1101/sendMessage/token",
  );
  const [refusal] = refusals(rest);
  assertEquals(refusal.body, {
    tenant_id: TENANT,
    function_name: "send-green-api-message",
    channel: "whatsapp",
    recipient_kind: "client",
    client_id: CLIENT,
    lead_id: null,
    group_id: null,
    send_kind: null,
    send_ref: null,
    subject_client_id: null,
    reason: "unclassified_service_send",
    enforced: false,
  });
});

Deno.test("send-green-api-message sends a staff alert to staff", async () => {
  const { response, provider, rest } = await send(
    { sendKind: "staff_alert" },
    resolved("staff"),
  );
  assertEquals(response.status, 200);
  assertEquals(provider.length, 1);
  assertEquals(refusals(rest), []);
});

Deno.test(
  "send-green-api-message lets a person write to a client",
  async () => {
    const { response, provider, rest } = await send(
      { clientId: CLIENT },
      resolved("client", [CLIENT]),
      "user-jwt",
    );
    assertEquals(response.status, 200);
    assertEquals(provider.length, 1);
    assertEquals(
      rest.some((call) => call.path === "/rpc/resolve_send_recipient"),
      false,
    );
  },
);
