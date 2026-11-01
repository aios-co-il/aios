// The client send guard as one step of a sender (AIO-261): the sender hands
// over what it checked (SenderSend) and gets back the refusal to return, or
// null. Senders take this step after their tenant, membership and chat-id
// checks and before the Staging guard and the provider.
import { corsHeaders } from "../cors.ts";
import { authorizeClientSend, clientSendRequest } from "./authorize.ts";
import { clientSendRefusedResponse } from "./response.ts";
import type { ClientSendDb } from "./rule-check.ts";
import type {
  ClientSendGuard,
  ClientSendRefused,
  SenderSend,
} from "./types.ts";

/**
 * The 403 a sender's handler returns when the guard over this database
 * refuses the send, else null.
 */
export function refuseClientSend(
  db: ClientSendDb,
  send: SenderSend,
): Promise<Response | null> {
  return refuseClientSendWith(
    (request) => authorizeClientSend(db, request),
    send,
  );
}

/**
 * The 403 a sender returns when the injected guard refuses the send, else
 * null. Checks steps that answer with a Response call it with the guard
 * their dependencies inject.
 */
export async function refuseClientSendWith(
  guard: ClientSendGuard,
  send: SenderSend,
): Promise<Response | null> {
  const refused = await clientSendRefusalOf(guard, send);
  return refused ? clientSendRefusedResponse(refused, corsHeaders) : null;
}

/**
 * The guard's refusal of the send, else null (an allowed or only observed
 * send). Checks steps call it with the guard their dependencies inject.
 */
export async function clientSendRefusalOf(
  guard: ClientSendGuard,
  send: SenderSend,
): Promise<ClientSendRefused | null> {
  const decision = await guard(clientSendRequest(send));
  return decision.allowed ? null : decision;
}
