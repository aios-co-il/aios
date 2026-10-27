import { assertEquals } from "jsr:@std/assert@1";
import {
  CLIENT,
  guardDb,
  OTHER_CLIENT,
  refusalRows,
  TENANT,
} from "./fake-guard-db.ts";
import { recordClientSendRefusal } from "./refusal-log.ts";
import type { ClientSendRequest, SendRecipient } from "./types.ts";

const request: ClientSendRequest = {
  functionName: "send-green-api-message",
  tenantId: TENANT,
  channel: "whatsapp",
  address: "972501234567@c.us",
  groupId: null,
  origin: "system",
  sendKind: "staff_alert",
  sendRef: null,
  subjectClientId: CLIENT,
};

const contact: SendRecipient = {
  kind: "client_contact",
  clientIds: [OTHER_CLIENT, CLIENT],
  leadId: null,
  groupId: null,
  ambiguous: false,
  senderStaff: false,
};

Deno.test(
  "recordClientSendRefusal writes what the address resolved to",
  async (t) => {
    await t.step("the subject client when it was matched", async () => {
      const { db, writes } = guardDb();
      await recordClientSendRefusal(db, request, contact, "staff_only", true);
      assertEquals(refusalRows(writes), [
        {
          tenant_id: TENANT,
          function_name: "send-green-api-message",
          channel: "whatsapp",
          recipient_kind: "client_contact",
          client_id: CLIENT,
          lead_id: null,
          group_id: null,
          send_kind: "staff_alert",
          send_ref: null,
          subject_client_id: CLIENT,
          reason: "staff_only",
          enforced: true,
        },
      ]);
    });

    await t.step("else the first matched client", async () => {
      const { db, writes } = guardDb();
      await recordClientSendRefusal(
        db,
        { ...request, subjectClientId: null },
        contact,
        "unclassified_service_send",
        false,
      );
      const [row] = refusalRows(writes);
      assertEquals(row, {
        ...row,
        client_id: OTHER_CLIENT,
        subject_client_id: null,
        enforced: false,
      });
    });

    await t.step("unresolved, and never the address", async () => {
      const { db, writes } = guardDb();
      await recordClientSendRefusal(db, request, null, "guard_error", true);
      const [row] = refusalRows(writes);
      assertEquals(JSON.stringify(row).includes("972501234567"), false);
      assertEquals(row.recipient_kind, "unresolved");
    });

    await t.step("a uuid send_ref, never free text", async () => {
      const { db, writes } = guardDb();
      const refs = [CLIENT, "972501234567@c.us:msg-1"];
      for (const sendRef of refs) {
        await recordClientSendRefusal(
          db,
          { ...request, sendRef },
          contact,
          "proof_invalid",
          true,
        );
      }
      assertEquals(
        refusalRows(writes).map((row) => row.send_ref),
        [CLIENT, null],
      );
    });
  },
);

Deno.test("recordClientSendRefusal never throws", async () => {
  const failing = {
    from: () => ({
      insert: () => Promise.resolve({ error: { message: "rls" } }),
    }),
  };
  await recordClientSendRefusal(failing, request, contact, "staff_only", true);
  const throwing = {
    from: () => {
      throw new Error("network");
    },
  };
  await recordClientSendRefusal(throwing, request, contact, "staff_only", true);
});
