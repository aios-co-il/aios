import { assertEquals } from "jsr:@std/assert@1";
import { authorizeClientSend, clientSendRequest } from "./authorize.ts";
import {
  CLIENT,
  guardDb,
  type ResolverRow,
  refusalRows,
  resolved,
  TENANT,
} from "./fake-guard-db.ts";
import type { ClientSendRequest } from "./types.ts";

const systemSend = (
  fields: Partial<ClientSendRequest> = {},
): ClientSendRequest => ({
  functionName: "send-manus-wa-message",
  tenantId: TENANT,
  channel: "whatsapp",
  address: "972501234567",
  groupId: null,
  origin: "system",
  sendKind: "staff_alert",
  sendRef: null,
  subjectClientId: null,
  ...fields,
});

/** The decision, the refusal rows and the RPCs for one send. */
async function decide(
  request: ClientSendRequest,
  recipient: ResolverRow,
  options: { resolverFails?: boolean } = {},
) {
  const { db, writes, rpcCalls } = guardDb({ recipient, ...options });
  const decision = await authorizeClientSend(db, request);
  return {
    decision,
    refusals: refusalRows(writes),
    rpcs: rpcCalls.map((call) => call.fn),
  };
}

Deno.test("authorizeClientSend lets through without a rule", async (t) => {
  await t.step("a person's send, without asking the database", async () => {
    const { decision, rpcs } = await decide(
      systemSend({ origin: "person", sendKind: "chat" }),
      resolved("client", [CLIENT]),
    );
    assertEquals(decision, { allowed: true, recipient: null, observed: null });
    assertEquals(rpcs, []);
  });

  await t.step(
    "a staff alert to staff, a lead or an unknown phone",
    async () => {
      for (const kind of ["staff", "lead", "unknown"] as const) {
        const { decision, refusals } = await decide(
          systemSend(),
          resolved(kind),
        );
        assertEquals(decision.allowed, true, kind);
        assertEquals(refusals, [], kind);
      }
    },
  );
});

Deno.test(
  "authorizeClientSend refuses a client what its rule refuses",
  async () => {
    const { decision, refusals } = await decide(
      systemSend({ subjectClientId: CLIENT }),
      resolved("client_contact", [CLIENT]),
    );
    assertEquals(decision.allowed ? null : decision.reason, "staff_only");
    assertEquals(refusals.length, 1);
    assertEquals(refusals[0].reason, "staff_only");
    assertEquals(refusals[0].enforced, true);
    assertEquals(refusals[0].client_id, CLIENT);
  },
);

Deno.test(
  "authorizeClientSend lets a staff alert reach the sender's own staff",
  async () => {
    // A client org's owner, or an agency tenant's own campaigner, whose
    // phone is also on a related tenant's client card.
    const { decision, refusals } = await decide(
      systemSend(),
      resolved("client_contact", [CLIENT], { sender_staff: true }),
    );
    assertEquals(decision.allowed, true);
    assertEquals(refusals, []);
  },
);

Deno.test("authorizeClientSend logs an address nothing can match", async () => {
  const { decision, refusals, rpcs } = await decide(
    systemSend({ address: "123456789012@lid" }),
    resolved("client", [CLIENT]),
  );
  assertEquals(decision, {
    allowed: true,
    recipient: null,
    observed: "unresolvable_address",
  });
  assertEquals(rpcs, []);
  assertEquals(refusals[0].recipient_kind, "unresolved");
  assertEquals(refusals[0].enforced, false);
});

Deno.test("authorizeClientSend only logs an observed refusal", async () => {
  const { decision, refusals } = await decide(
    systemSend({ sendKind: null }),
    resolved("client_group", [CLIENT], { group_id: "group-1" }),
  );
  assertEquals(decision, {
    allowed: true,
    recipient: {
      kind: "client_group",
      clientIds: [CLIENT],
      leadId: null,
      groupId: "group-1",
      ambiguous: false,
      senderStaff: false,
    },
    observed: "unclassified_service_send",
  });
  assertEquals(refusals[0].reason, "unclassified_service_send");
  assertEquals(refusals[0].enforced, false);
});

Deno.test(
  "authorizeClientSend fails closed when the lookup fails",
  async () => {
    const { decision, refusals } = await decide(
      systemSend(),
      resolved("staff"),
      { resolverFails: true },
    );
    assertEquals(decision, {
      allowed: false,
      reason: "guard_error",
      recipient: null,
    });
    assertEquals(refusals[0].recipient_kind, "unresolved");
    assertEquals(refusals[0].enforced, true);
  },
);

Deno.test("clientSendRequest reads a sender's body fields", async (t) => {
  const base = {
    functionName: "send-meta-whatsapp-message",
    tenantId: TENANT,
    channel: "whatsapp" as const,
    address: "972501234567",
  };
  const GROUP = "99999999-9999-4999-8999-999999999999";

  await t.step("a service-role call is a system send", () => {
    assertEquals(
      clientSendRequest({
        ...base,
        groupId: GROUP,
        isServiceRole: true,
        sendKind: "report",
        sendRef: "  schedule-1  ",
        clientId: CLIENT,
      }),
      {
        ...base,
        groupId: GROUP,
        origin: "system",
        sendKind: "report",
        sendRef: "schedule-1",
        subjectClientId: CLIENT,
      },
    );
  });

  await t.step("an unknown kind or a non-uuid id is dropped", () => {
    const request = clientSendRequest({
      ...base,
      groupId: "group-1",
      isServiceRole: true,
      sendKind: "pulse",
      sendRef: undefined,
      clientId: "client-name",
    });
    assertEquals(request.sendKind, null);
    assertEquals(request.subjectClientId, null);
    assertEquals(request.groupId, null);
  });

  await t.step("a browser call is a person's chat", () => {
    const request = clientSendRequest({
      ...base,
      groupId: null,
      isServiceRole: false,
      sendKind: "staff_alert",
      sendRef: null,
      clientId: null,
    });
    assertEquals([request.origin, request.sendKind], ["person", "chat"]);
  });
});
