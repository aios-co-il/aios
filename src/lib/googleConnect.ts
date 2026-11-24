import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionInvoke";
import {
  CONNECT_CODE_MESSAGE,
  CONNECT_ERROR_MESSAGE,
  GOOGLE_CONNECT_FUNCTIONS,
  type GoogleConnectFunction,
} from "../../supabase/functions/_shared/google-oauth/handoff-contract.ts";

/**
 * Finishing a Google connect in the signed-in app. Google's redirect reaches
 * our edge function without an AIOS session, so the function hands the code
 * back (a popup message, or the URL fragment for full-page flows, see
 * googleConnectFragment.ts) and the app sends it to `complete` with the user's
 * session. The function refuses a code whose connect another user started.
 */

export const connectCodeSchema = z.object({
  provider: z.enum(GOOGLE_CONNECT_FUNCTIONS),
  code: z.string().min(1),
  state: z.string().min(1),
});

export type GoogleConnectCode = z.infer<typeof connectCodeSchema>;

const popupMessageSchema = z.discriminatedUnion("type", [
  connectCodeSchema.extend({ type: z.literal(CONNECT_CODE_MESSAGE) }),
  z.object({
    type: z.literal(CONNECT_ERROR_MESSAGE),
    provider: z.enum(GOOGLE_CONNECT_FUNCTIONS),
    state: z.string(),
    error: z.string().min(1),
  }),
]);

/** What the popup reported for this attempt: the code to complete, or why it failed. */
export type PopupConnectResult =
  { code: GoogleConnectCode } | { error: string };

/** Which popup messages belong to one connect attempt. */
export type PopupAttempt = {
  provider: GoogleConnectFunction;
  /** The state this attempt sent to Google. */
  state: string | null;
  /** The origin of the callback Google returns to, which posts the message. */
  callbackOrigin: string | null;
};

/** How often to check whether the user closed the popup. */
const POPUP_CLOSED_POLL_MS = 600;

const COMPLETE_FAILED = "החיבור ל-Google נכשל. נסו להתחבר שוב.";

/** Sends the code to the function's `complete` action with the signed-in session; rejects with the function's reason. */
export async function completeGoogleConnect({
  provider,
  code,
  state,
}: GoogleConnectCode): Promise<void> {
  const { error } = await supabase.functions.invoke(
    `${provider}?action=complete`,
    { body: { action: "complete", code, state } },
  );
  if (error) {
    throw new Error(await edgeFunctionErrorMessage(error, COMPLETE_FAILED));
  }
}

/**
 * Opens Google's consent screen in a popup and resolves once the connect is
 * completed for the signed-in user. Rejects when the popup is blocked, closed
 * first, reports an error, or `complete` fails.
 */
export function connectGoogleInPopup(
  authUrl: string,
  provider: GoogleConnectFunction,
): Promise<void> {
  const popup = window.open(authUrl, provider, "width=600,height=700");
  if (!popup) {
    return Promise.reject(
      new Error("חלון הקופץ נחסם. נא לאפשר חלונות קופצים ולנסות שוב."),
    );
  }

  const attempt = popupAttempt(authUrl, provider);

  return new Promise<void>((resolve, reject) => {
    let closedTimer = 0;
    function stop() {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    }

    function onMessage(event: MessageEvent) {
      const result = popupConnectResult(event, attempt);
      if (!result) {
        return;
      }
      stop();
      if ("error" in result) {
        reject(new Error(result.error));
        return;
      }
      completeGoogleConnect(result.code).then(resolve, reject);
    }

    window.addEventListener("message", onMessage);
    closedTimer = window.setInterval(() => {
      if (popup.closed) {
        stop();
        reject(new Error("החיבור בוטל"));
      }
    }, POPUP_CLOSED_POLL_MS);
  });
}

/**
 * The attempt for an authorize URL from our edge function. The callback page
 * is served from the redirect_uri's origin (the project's custom domain when
 * PUBLIC_API_URL is set), so that is the only origin its message may come from.
 */
export function popupAttempt(
  authUrl: string,
  provider: GoogleConnectFunction,
): PopupAttempt {
  const params = new URL(authUrl).searchParams;

  return {
    provider,
    state: params.get("state"),
    callbackOrigin: callbackOrigin(params.get("redirect_uri")),
  };
}

/**
 * What the popup posted for this attempt: from the callback's origin, for this
 * function, and carrying the state this attempt sent to Google, so two
 * overlapping attempts never complete the same code.
 */
export function popupConnectResult(
  event: MessageEvent,
  attempt: PopupAttempt,
): PopupConnectResult | null {
  if (!attempt.callbackOrigin || event.origin !== attempt.callbackOrigin) {
    return null;
  }

  const message = popupMessageSchema.safeParse(event.data);
  if (
    !message.success ||
    message.data.provider !== attempt.provider ||
    message.data.state !== attempt.state
  ) {
    return null;
  }

  if (message.data.type === CONNECT_ERROR_MESSAGE) {
    return { error: message.data.error };
  }

  const { code, state } = message.data;

  return { code: { provider: attempt.provider, code, state } };
}

/** The redirect URI's origin when it is https (or local http), else null. */
function callbackOrigin(redirectUri: string | null): string | null {
  const url = parsedUrl(redirectUri);
  if (!url) {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  return url.protocol === "https:" || (local && url.protocol === "http:")
    ? url.origin
    : null;
}

/** The value as a URL, or null when it is not one. URL.canParse is missing before Safari 17 and Chrome 120. */
function parsedUrl(value: string | null): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
