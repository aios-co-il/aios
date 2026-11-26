// The webhook token contract between configure-green-api, which gives a Green
// API line its token, and green-api-webhook, which checks it on every call.
//
// Green API docs (Webhook Endpoint, "Authorization"): "If the WebhookURLToken
// parameter is not empty, our server will send a request to your server with
// an authorization header Authorization. [...] When using Bearer
// authorization, you need to pass a string like this to the webhookUrlToken
// field: Bearer AuthToken".
import { bearerFrom } from "../auth/edge-caller-auth.ts";

/** The value configure-green-api sets as the line's webhookUrlToken. */
export function webhookUrlTokenSetting(token: string): string {
  return `Bearer ${token}`;
}

/** The token a webhook call presents in its Authorization header, or null. */
export function presentedWebhookToken(
  authorization: string | null,
): string | null {
  return bearerFrom(authorization);
}
