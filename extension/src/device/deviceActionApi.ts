/**
 * The panel's calls to carmen-device-action with the user's own session. Plain `fetch`
 * rather than `supabase.functions.invoke`, so a closing panel can send its last completion
 * with `keepalive`; the extension's host permission for the Supabase origins means no CORS
 * preflight stands in the way.
 */
import {
  type DeviceClaimReply,
  isDeviceToolName,
} from "../../../supabase/functions/_shared/carmen/device/contract.ts";
import type { PanelClaimFailure } from "../../../supabase/functions/_shared/carmen/device/panel-envelope.ts";
import type { CompleteBody } from "./completion.ts";
import type { ClaimAnswer } from "./readActions.ts";

const FUNCTION_NAME = "carmen-device-action";

// A call the panel waits on gives up after this, so a stalled connection cannot hold the
// open action; the function answers far sooner.
const REQUEST_TIMEOUT_MS = 30_000;

export type DeviceActionApiConfig = {
  supabaseUrl: string;
  publishableKey: string;
  /** The signed-in user's access token, or null without a session. */
  accessToken: () => Promise<string | null>;
  fetch: typeof fetch;
};

export type DeviceActionApi = {
  claim: (id: string) => Promise<ClaimAnswer>;
  complete: (body: CompleteBody) => Promise<void>;
  completeOnClose: (body: CompleteBody) => void;
};

/** The calls, bound to one environment and session. */
export function deviceActionApi(
  config: DeviceActionApiConfig,
): DeviceActionApi {
  const endpoint = `${config.supabaseUrl}/functions/v1/${FUNCTION_NAME}`;
  /** The last token used, for the one call a closing page cannot wait to look one up for. */
  let lastToken: string | null = null;

  /** One POST as the signed-in user. */
  async function post(body: object, keepalive = false): Promise<Response> {
    const token = keepalive ? lastToken : await config.accessToken();
    if (!token) {
      throw new SignedOut();
    }
    lastToken = token;
    return config.fetch(endpoint, {
      method: "POST",
      keepalive,
      // A closing page cannot wait for a timeout, and keepalive outlives the page anyway.
      signal: keepalive ? undefined : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Claims an action: its tool and arguments on 200, otherwise why, never a throw. No
   * session or a rejected one (401) is `signed_out`; the server's one refusal (404) is
   * `refused`; anything else is `failed`.
   */
  async function claim(id: string): Promise<ClaimAnswer> {
    try {
      const response = await post({ action: "claim", id });
      const answer: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        return {
          ok: false,
          failure: claimFailure(response.status),
          reason: `${response.status} ${JSON.stringify(answer)}`,
        };
      }
      return answer &&
        typeof answer === "object" &&
        "tool" in answer &&
        isDeviceToolName(answer.tool)
        ? {
            ok: true,
            tool: answer.tool,
            arguments: "arguments" in answer ? answer.arguments : undefined,
            trustedOrigin: textField(answer, "trusted_origin"),
            conversationId: textField(answer, "conversation_id"),
            // Only a real true grants it: anything else from the answer is no permission.
            sensitiveScreenshotsAllowed:
              Object.getOwnPropertyDescriptor(
                answer,
                "sensitive_screenshots_allowed" satisfies keyof DeviceClaimReply,
              )?.value === true,
          }
        : {
            ok: false,
            failure: "failed",
            reason: "the claim answer has no device tool",
          };
    } catch (error) {
      const failure = error instanceof SignedOut ? "signed_out" : "failed";
      return { ok: false, failure, reason: String(error) };
    }
  }

  /**
   * Completes an action; rejects with the function's answer unless it is ok. A network
   * failure or a server error is retried once: the function completes only a `claimed`
   * row, so a repeat of a completion that did land is refused, never applied twice.
   */
  async function complete(body: CompleteBody): Promise<void> {
    const first = await post(body).catch(asError);
    const retry = first instanceof Error || first.status >= 500;
    if (retry) {
      console.warn("[carmen-panel] retrying a completion", first);
    }
    const response = retry ? await post(body) : first;
    if (!response.ok) {
      throw new Error(
        `${response.status} ${await response.text().catch(() => "")}`,
      );
    }
  }

  /** Completes from a closing page; the browser may or may not deliver it. */
  function completeOnClose(body: CompleteBody): void {
    post(body, true).catch((error: unknown) => {
      console.error(
        "[carmen-panel] the closing completion was not sent",
        error,
      );
    });
  }

  return { claim, complete, completeOnClose };
}

/** The extension holds no session to send. */
class SignedOut extends Error {
  constructor() {
    super("No signed-in session in the extension");
  }
}

/** What a refused or failed claim's HTTP status says. */
function claimFailure(status: number): PanelClaimFailure {
  if (status === 401) {
    return "signed_out";
  }
  return status === 404 ? "refused" : "failed";
}

/** A field of the claim's answer when it is a string, else null: anything else grants nothing. */
function textField(
  answer: object,
  field: keyof DeviceClaimReply,
): string | null {
  const value: unknown = Object.getOwnPropertyDescriptor(answer, field)?.value;
  return typeof value === "string" ? value : null;
}

/** Any thrown value as an Error. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
