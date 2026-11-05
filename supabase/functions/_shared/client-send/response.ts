// The answer a sender gives when the client send guard refuses.
import type { ClientSendRefused } from "./types.ts";

/** The refused send's JSON response, with the sender's CORS headers. */
export function clientSendRefusedResponse(
  decision: ClientSendRefused,
  cors: Record<string, string>,
): Response {
  const { status, body } = clientSendRefusal(decision);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** 403 naming the rule; the address and its client stay out of the body. */
export function clientSendRefusal(decision: ClientSendRefused) {
  return {
    status: 403,
    body: { error: "client_send_not_authorized", reason: decision.reason },
  };
}
