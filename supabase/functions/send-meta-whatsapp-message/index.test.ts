// The client send guard in this handler (AIO-261): a refused send never
// reaches Meta's Cloud API, an observed one does.
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

/**
 * A service-role send to a phone, with the resolver's answer for it and any
 * REST routes answered otherwise.
 */
function send(
  body: Record<string, unknown>,
  recipient: ResolverRow,
  routes: Record<string, unknown> = {},
) {
  const request = new Request(
    "http://functions.test/send-meta-whatsapp-message",
    {
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
    },
  );
  return callServedHandler(
    handler,
    request,
    {
      "GET /clients": [{ tenant_id: TENANT, phone: "050-1234567" }],
      "GET /tenant_users": [{ user_id: SENDER }],
      "POST /rpc/is_super_admin": false,
      "GET /tenant_integrations": [
        {
          id: "line-1",
          tenant_id: TENANT,
          user_id: SENDER,
          settings: { phone_number_id: "pn-1", graph_version: "v21.0" },
        },
      ],
      "GET /meta_whatsapp_tokens": [{ access_token: "meta-token" }],
      "POST /rpc/resolve_send_recipient": [recipient],
      ...routes,
    },
    { messages: [{ id: "wamid.1" }] },
  );
}

/** The refusal rows the handler wrote. */
const refusals = (rest: { path: string; body: unknown }[]) =>
  rest.filter((call) => call.path === "/client_send_refusals");

Deno.test(
  "send-meta-whatsapp-message refuses a staff alert to a client",
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

Deno.test(
  "send-meta-whatsapp-message still sends an observed send",
  async () => {
    const { response, provider, rest } = await send(
      {},
      resolved("client", [CLIENT]),
    );
    assertEquals(response.status, 200);
    assertEquals(provider.length, 1);
    assertEquals(
      provider[0].path,
      "https://graph.facebook.com/v21.0/pn-1/messages",
    );
    const [refusal] = refusals(rest);
    assertEquals(refusal.body, {
      tenant_id: TENANT,
      function_name: "send-meta-whatsapp-message",
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
  },
);

Deno.test(
  "send-meta-whatsapp-message sends a staff alert to staff",
  async () => {
    const { response, provider, rest } = await send(
      { sendKind: "staff_alert" },
      resolved("staff"),
    );
    assertEquals(response.status, 200);
    assertEquals(provider.length, 1);
    assertEquals(refusals(rest), []);
  },
);

Deno.test(
  "send-meta-whatsapp-message answers 500 when the membership lookup fails",
  async () => {
    const { response, provider, rest } = await send(
      { sendKind: "staff_alert" },
      resolved("staff"),
      {
        "POST /rpc/is_super_admin": new Response(
          JSON.stringify({ message: "lookup failed" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      },
    );
    assertEquals(response.status, 500);
    assertEquals(provider, []);
    assertEquals(
      rest.some((call) => call.path === "/rpc/resolve_send_recipient"),
      false,
    );
  },
);
