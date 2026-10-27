import { assertEquals } from "jsr:@std/assert@1";
import { CLIENT } from "../_shared/client-send/fake-guard-db.ts";
import type {
  ClientSendDecision,
  ClientSendRequest,
} from "../_shared/client-send/types.ts";
import { clientSendBlock } from "./client-send.ts";
import type { FileSendRequest } from "./request.ts";

const SCHEDULE = "55555555-5555-4555-8555-555555555555";

const request: FileSendRequest = {
  clientId: CLIENT,
  leadId: null,
  groupId: null,
  phoneNumber: "0501234567",
  tenantId: "tenant-1",
  integrationId: null,
  senderUserId: null,
  caption: "",
  captionFallback: false,
  sendKind: "report",
  sendRef: SCHEDULE,
  media: { kind: "url", url: "", isImage: true, mimeType: "", filename: null },
};

/** The guard's request for this send, and the block it answers with. */
async function block(decision: ClientSendDecision, isServiceRole: boolean) {
  const asked: ClientSendRequest[] = [];
  const response = await clientSendBlock(
    async (guardRequest) => {
      asked.push(guardRequest);
      return decision;
    },
    {
      request,
      isServiceRole,
      tenantId: "tenant-1",
      target: { to: "972501234567", isGroup: false },
    },
  );
  return { asked, response };
}

Deno.test("clientSendBlock", async (t) => {
  await t.step("asks the guard about the gateway recipient", async () => {
    const { asked, response } = await block(
      { allowed: true, recipient: null, observed: null },
      true,
    );
    assertEquals(response, null);
    assertEquals(asked, [
      {
        functionName: "send-manus-wa-file",
        tenantId: "tenant-1",
        channel: "whatsapp",
        address: "972501234567",
        groupId: null,
        origin: "system",
        sendKind: "report",
        sendRef: SCHEDULE,
        subjectClientId: CLIENT,
      },
    ]);
  });

  await t.step("a signed-in caller's send is a person's", async () => {
    const { asked } = await block(
      { allowed: true, recipient: null, observed: null },
      false,
    );
    assertEquals(asked[0].origin, "person");
  });

  await t.step("a refusal is a 403 naming the rule", async () => {
    const { response } = await block(
      { allowed: false, reason: "subject_mismatch", recipient: null },
      true,
    );
    assertEquals(response?.status, 403);
    assertEquals(await response?.json(), {
      error: "client_send_not_authorized",
      reason: "subject_mismatch",
    });
  });
});
