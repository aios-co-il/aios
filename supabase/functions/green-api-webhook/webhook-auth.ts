// green-api-webhook is public (verify_jwt = false): Green API cannot sign in.
// Each line's calls carry the webhook token configure-green-api gave it, and a
// call without that token is refused before anything is read or stored, so a
// forged message cannot reach the CRM or wake Carmen.
//
// Rollout: a line with no stored token is still accepted and logged as
// tokenless, until its owner refreshes its webhook settings (docs/agents/carmen.md).
import { timingSafeEqual } from "../_shared/security.ts";
import { serviceClient, type DbClient } from "../_shared/supabase-clients.ts";
import { presentedWebhookToken } from "../_shared/green-api-webhook-auth/token.ts";

/**
 * How long after a token is set the call it replaced is still accepted: the
 * previous token, or no token on a line that had none. Green API docs
 * (SetSettings): "The settings are applied within 5 minutes after invoking the
 * setSettings method."
 */
export const WEBHOOK_TOKEN_GRACE_MS = 10 * 60 * 1000;

/** A line's stored webhook tokens (green_api_webhook_tokens). */
export type WebhookTokens = {
  current: string;
  previous: string | null;
  /** When `current` was set, in epoch ms. */
  setAt: number;
};

export type WebhookCallCheck =
  | {
      accepted: true;
      how:
        | "token"
        | "no_token_stored"
        | "previous_token_in_grace"
        | "tokenless_in_grace";
    }
  | { accepted: false; why: "missing_token" | "wrong_token" };

/** The line a call names, as far as the check needs it. */
export type CheckedLine = { id: string; tenant_id: string };

/**
 * Refuses a webhook call that does not carry its line's token: null lets the
 * call through, a Response is returned as it is. Logs every refusal and every
 * tokenless call it lets through, never the call's body. `db` and `now`
 * default to the service client and the clock; tests pass fakes.
 */
export async function refuseUnverifiedCall(
  req: Request,
  line: CheckedLine,
  db: Pick<DbClient, "rpc"> = serviceClient(),
  now: () => number = Date.now,
): Promise<Response | null> {
  const logged = { integration_id: line.id, tenant_id: line.tenant_id };

  let tokens: WebhookTokens | null;
  try {
    tokens = await loadWebhookTokens(db, line.id);
  } catch (e) {
    console.error("[green-api-webhook] webhook token lookup failed", {
      ...logged,
      error: e instanceof Error ? e.message : "unknown",
    });
    return Response.json({ error: "Webhook check failed" }, { status: 500 });
  }

  const presented = presentedWebhookToken(req.headers.get("Authorization"));
  const check = checkWebhookCall(presented, tokens, now());

  if (!check.accepted) {
    console.warn("[green-api-webhook] refused call", {
      ...logged,
      why: check.why,
    });
    return unauthorizedWebhookResponse();
  }
  if (check.how !== "token") {
    console.warn("[green-api-webhook] accepted call without its line's token", {
      ...logged,
      how: check.how,
    });
  }
  return null;
}

/** The one refusal every unverified call gets, whatever the reason. */
export function unauthorizedWebhookResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Whether a call presenting `presented` is accepted for a line with `tokens`.
 * A line with no stored token accepts every call (rollout); otherwise only
 * its current token, and within WEBHOOK_TOKEN_GRACE_MS of a change the token
 * it replaced, or no token when it replaced none.
 */
export function checkWebhookCall(
  presented: string | null,
  tokens: WebhookTokens | null,
  now: number,
): WebhookCallCheck {
  if (!tokens) {
    return { accepted: true, how: "no_token_stored" };
  }
  if (presented && timingSafeEqual(presented, tokens.current)) {
    return { accepted: true, how: "token" };
  }

  const inGrace = now - tokens.setAt < WEBHOOK_TOKEN_GRACE_MS;
  if (
    inGrace &&
    tokens.previous &&
    presented &&
    timingSafeEqual(presented, tokens.previous)
  ) {
    return { accepted: true, how: "previous_token_in_grace" };
  }
  if (inGrace && !tokens.previous && !presented) {
    return { accepted: true, how: "tokenless_in_grace" };
  }
  return { accepted: false, why: presented ? "wrong_token" : "missing_token" };
}

/** The line's stored tokens, or null when it has none. Throws when the lookup fails. */
async function loadWebhookTokens(
  db: Pick<DbClient, "rpc">,
  integrationId: string,
): Promise<WebhookTokens | null> {
  const { data, error } = await db.rpc("green_api_webhook_tokens", {
    p_integration_id: integrationId,
  });
  if (error) {
    throw new Error(`green_api_webhook_tokens failed: ${error.message}`);
  }

  const row = data?.[0];
  if (!row?.current_token) {
    return null;
  }
  return {
    current: row.current_token,
    previous: row.previous_token || null,
    setAt: Date.parse(row.set_at),
  };
}
