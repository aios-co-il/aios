import { assertEquals } from "jsr:@std/assert@1";
import {
  CLIENT,
  guardDb,
  refusalRows,
  resolved,
  TENANT,
} from "./fake-guard-db.ts";
import { clientSendRefusalOf, refuseClientSend } from "./sender-step.ts";
import type {
  ClientSendDecision,
  ClientSendRequest,
  SenderSend,
} from "./types.ts";

const GROUP = "66666666-6666-4666-8666-666666666666";

/** A service-role staff alert to a phone, with these fields changed. */
const send = (fields: Partial<SenderSend> = {}): SenderSend => ({
  functionName: "send-green-api-message",
  tenantId: TENANT,
  channel: "whatsapp",
  address: "972501234567@c.us",
  groupId: null,
  isServiceRole: true,
  body: { sendKind: "staff_alert", sendRef: null, clientId: CLIENT },
  ...fields,
});

Deno.test("refuseClientSend", async (t) => {
  await t.step(
    "answers a refused send with a 403 naming the rule",
    async () => {
      const { db, writes } = guardDb({
        recipient: resolved("client", [CLIENT]),
      });
      const response = await refuseClientSend(db, send());
      assertEquals(response?.status, 403);
      assertEquals(response?.headers.get("Access-Control-Allow-Origin"), "*");
      assertEquals(await response?.json(), {
        error: "client_send_not_authorized",
        reason: "staff_only",
      });
      assertEquals(refusalRows(writes).length, 1);
    },
  );

  await t.step("lets an observed send through, logged", async () => {
    const { db, writes } = guardDb({ recipient: resolved("client", [CLIENT]) });
    const response = await refuseClientSend(
      db,
      send({ body: { clientId: CLIENT } }),
    );
    assertEquals(response, null);
    assertEquals(refusalRows(writes)[0].enforced, false);
  });

  await t.step("lets a person's send through without a lookup", async () => {
    const { db, rpcCalls } = guardDb({
      recipient: resolved("client", [CLIENT]),
    });
    const response = await refuseClientSend(db, send({ isServiceRole: false }));
    assertEquals(response, null);
    assertEquals(rpcCalls, []);
  });

  await t.step("refuses when the lookup fails", async () => {
    const { db } = guardDb({ failing: ["resolve_send_recipient"] });
    const response = await refuseClientSend(db, send());
    assertEquals(await response?.json(), {
      error: "client_send_not_authorized",
      reason: "guard_error",
    });
  });
});

Deno.test("clientSendRefusalOf", async (t) => {
  /** The requests an injected guard got, and the step's answer. */
  async function ask(decision: ClientSendDecision, sent: SenderSend) {
    const asked: ClientSendRequest[] = [];
    const refused = await clientSendRefusalOf(async (request) => {
      asked.push(request);
      return decision;
    }, sent);
    return { asked, refused };
  }

  await t.step("asks the guard with the sender's checked values", async () => {
    const { asked, refused } = await ask(
      { allowed: true, recipient: null, observed: null },
      send({
        address: "120363416882903532@g.us",
        groupId: GROUP,
        body: { sendKind: "report", sendRef: " schedule-1 ", clientId: CLIENT },
      }),
    );
    assertEquals(refused, null);
    assertEquals(asked, [
      {
        functionName: "send-green-api-message",
        tenantId: TENANT,
        channel: "whatsapp",
        address: "120363416882903532@g.us",
        groupId: GROUP,
        origin: "system",
        sendKind: "report",
        sendRef: "schedule-1",
        subjectClientId: CLIENT,
      },
    ]);
  });

  await t.step(
    "returns the refusal, and null for an observed one",
    async () => {
      const refusedDecision: ClientSendDecision = {
        allowed: false,
        reason: "subject_mismatch",
        recipient: null,
      };
      assertEquals(
        (await ask(refusedDecision, send())).refused,
        refusedDecision,
      );
      const observed = await ask(
        { allowed: true, recipient: null, observed: "not_opted_in" },
        send(),
      );
      assertEquals(observed.refused, null);
    },
  );
});
