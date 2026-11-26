import { errorMessage } from "../error-message.ts";
import type { LLMTarget } from "./contracts.ts";

/**
 * Sends one request to a link of Carmen's model chain. A connected brain
 * (carmen_brain_connections) whose endpoint cannot be reached at all (refused
 * connection, DNS, TLS) answers as a failed link: a 502 whose text names the
 * failure, so the loop moves on as it does for any other failure of that
 * brain. Carmen's own providers keep rejecting as before.
 */
export async function fetchChainLink(
  target: Pick<LLMTarget, "url" | "connectionId">,
  init: RequestInit,
  send: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await send(target.url, init);
  } catch (error) {
    if (!target.connectionId) {
      throw error;
    }

    return new Response(`endpoint unreachable: ${errorMessage(error)}`, {
      status: 502,
    });
  }
}
