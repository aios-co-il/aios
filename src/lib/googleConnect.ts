import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionInvoke";
import {
  CONSENT_REFUSED_ERROR,
  type GoogleConnectFunction,
  INVALID_STATE_ERROR,
} from "../../supabase/functions/_shared/google-oauth/handoff-contract.ts";
import type { GoogleConnectCode } from "./googleConnectCode";
import { popupAttempt, popupConnectResult } from "./googleConnectPopup";

/**
 * Finishing a Google connect in the signed-in app. Google's redirect reaches
 * our edge function without an AIOS session, so the function hands the code
 * back (a popup message, see googleConnectPopup.ts, or the URL fragment for
 * full-page flows, see googleConnectFragment.ts) and the app sends it to
 * `complete` with the user's session. The function refuses a code whose
 * connect another user started.
 */

/** How often to check whether the user closed the popup. */
const POPUP_CLOSED_POLL_MS = 600;

/** The fallback when `complete` gives no reason; callers prefix their own "failed" text. */
const TRY_AGAIN = "נסו להתחבר שוב.";

/** What the app says for the error a connect returned with instead of a code. */
const CONNECT_ERROR_TEXT = new Map<string, string>([
  [CONSENT_REFUSED_ERROR, "החיבור ל-Google בוטל."],
  [INVALID_STATE_ERROR, "קישור החיבור פג תוקף. נסו להתחבר שוב."],
]);

/** Google's error codes are snake_case words; any other value came from a crafted link and is not shown. */
const ERROR_CODE = /^[a-z_]{1,40}$/;

/** The text to show for a connect's error code (Google's `error`, or ours). */
export function connectErrorMessage(error: string): string {
  const known = CONNECT_ERROR_TEXT.get(error);
  if (known) {
    return known;
  }

  return ERROR_CODE.test(error)
    ? `Google החזיר שגיאה (${error}). ${TRY_AGAIN}`
    : `החיבור ל-Google נכשל. ${TRY_AGAIN}`;
}

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
    throw new Error(await edgeFunctionErrorMessage(error, TRY_AGAIN));
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
        reject(new Error(connectErrorMessage(result.error)));
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
