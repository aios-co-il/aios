// The client send guard's step in the Manus file checks (AIO-261): an
// automatic send reaches a client only with a proof or the client card's
// opt-in (_shared/client-send/rules.ts).
import { clientSendRequest } from "../_shared/client-send/authorize.ts";
import { clientSendRefusedResponse } from "../_shared/client-send/response.ts";
import type { ClientSendGuard } from "../_shared/client-send/types.ts";
import { corsHeaders } from "../_shared/cors.ts";
import type { SendContext } from "./prepare.ts";

/**
 * 403 when the guard refuses this send, else null. The group row counts only
 * when its chat id is where the file goes.
 */
export async function clientSendBlock(
  guard: ClientSendGuard,
  send: Pick<SendContext, "request" | "isServiceRole" | "tenantId" | "target">,
): Promise<Response | null> {
  const decision = await guard(
    clientSendRequest({
      functionName: "send-manus-wa-file",
      tenantId: send.tenantId,
      channel: "whatsapp",
      address: send.target.to,
      groupId: send.target.isGroup ? send.request.groupId : null,
      isServiceRole: send.isServiceRole,
      sendKind: send.request.sendKind,
      sendRef: send.request.sendRef,
      clientId: send.request.clientId,
    }),
  );
  return decision.allowed
    ? null
    : clientSendRefusedResponse(decision, corsHeaders);
}
