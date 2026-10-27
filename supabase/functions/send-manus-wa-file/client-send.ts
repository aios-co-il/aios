// The client send guard's step in the Manus file checks (AIO-261): an
// automatic send reaches a client only with a proof or the client card's
// opt-in (_shared/client-send/rules.ts).
import { clientSendRequest } from "../_shared/client-send/authorize.ts";
import { clientSendRefusedResponse } from "../_shared/client-send/response.ts";
import type {
  ClientSendDecision,
  ClientSendRequest,
} from "../_shared/client-send/types.ts";
import { corsHeaders } from "../_shared/cors.ts";
import type { SendContext } from "./prepare.ts";

/** authorizeClientSend over the service-role client (deps.ts). */
export type AuthorizeClientSend = (
  request: ClientSendRequest,
) => Promise<ClientSendDecision>;

/** 403 when the guard refuses this send, else null. */
export async function clientSendBlock(
  authorize: AuthorizeClientSend,
  send: Pick<SendContext, "request" | "isServiceRole" | "tenantId" | "target">,
): Promise<Response | null> {
  const decision = await authorize(
    clientSendRequest({
      functionName: "send-manus-wa-file",
      tenantId: send.tenantId,
      channel: "whatsapp",
      address: send.target.to,
      groupId: send.request.groupId,
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
