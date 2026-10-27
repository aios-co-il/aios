// The client send guard in this handler (AIO-261): a refused send never
// reaches the Manus gateway, an observed one does.
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

const GROUP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const GROUP_CHAT = "120363416882903532@g.us";

/** A service-role send to a phone, with the resolver's answer for it. */
function send(body: Record<string, unknown>, recipient: ResolverRow) {
  const request = new Request("http://functions.test/send-manus-wa-message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
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
      "GET /tenant_users": [{ user_id: SENDER }],
      "POST /rpc/is_super_admin": false,
      "GET /tenant_integrations": [
        {
          id: "line-1",
          tenant_id: TENANT,
          user_id: SENDER,
          api_key: "key",
          settings: { instance_id: "inst-1" },
        },
      ],
      "GET /whatsapp_groups": [
        { tenant_id: TENANT, group_chat_id: GROUP_CHAT },
      ],
      "POST /rpc/resolve_send_recipient": [recipient],
    },
    { success: true, messageId: "manus-1" },
  );
}

/** The refusal rows the handler wrote. */
const refusals = (rest: { path: string; body: unknown }[]) =>
  rest.filter((call) => call.path === "/client_send_refusals");

Deno.test(
  "send-manus-wa-message refuses a staff alert to a client",
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

Deno.test("send-manus-wa-message still sends an observed send", async () => {
  const { response, provider, rest } = await send(
    {},
    resolved("client", [CLIENT]),
  );
  assertEquals(response.status, 200);
  assertEquals(provider.length, 1);
  assertEquals(
    provider[0].path,
    "https://whatsappgw-pzpyrrww.manus.space/api/v1/instances/inst-1/send/text",
  );
  const [refusal] = refusals(rest);
  assertEquals(refusal.body, {
    tenant_id: TENANT,
    function_name: "send-manus-wa-message",
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

Deno.test(
  "send-manus-wa-message names the group row it read to the resolver",
  async () => {
    const { response, provider, rest } = await send(
      { sendKind: "staff_alert", groupId: GROUP, phoneNumber: undefined },
      resolved("client_group", [CLIENT], { group_id: GROUP }),
    );
    assertEquals(response.status, 403);
    assertEquals(provider, []);
    const resolverCall = rest.find(
      (call) => call.path === "/rpc/resolve_send_recipient",
    );
    assertEquals(resolverCall?.body, {
      p_tenant_id: TENANT,
      p_shape: "group",
      p_address: GROUP_CHAT,
      p_group_id: GROUP,
    });
  },
);

Deno.test("send-manus-wa-message sends a staff alert to staff", async () => {
  const { response, provider, rest } = await send(
    { sendKind: "staff_alert" },
    resolved("staff"),
  );
  assertEquals(response.status, 200);
  assertEquals(provider.length, 1);
  assertEquals(refusals(rest), []);
});
