import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  CONNECT_CODE_MESSAGE,
  CONNECT_FRAGMENT_KEY,
  GOOGLE_CONNECT_FUNCTIONS,
  type GoogleConnectFunction,
} from "../../supabase/functions/_shared/google-oauth/handoff-contract.ts";

/**
 * Finishing a Google connect in the signed-in app. Google's redirect reaches
 * our edge function without an AIOS session, so the function hands the code
 * back (a popup message, or the URL fragment for full-page flows) and the app
 * sends it to `complete` with the user's session. The function refuses a code
 * whose connect another user started.
 */

const connectCodeSchema = z.object({
  provider: z.enum(GOOGLE_CONNECT_FUNCTIONS),
  code: z.string().min(1),
  state: z.string().min(1),
});

export type GoogleConnectCode = z.infer<typeof connectCodeSchema>;

const popupMessageSchema = connectCodeSchema.extend({
  type: z.literal(CONNECT_CODE_MESSAGE),
});

/** How often to check whether the user closed the popup. */
const POPUP_CLOSED_POLL_MS = 600;

/** Sends the code to the function's `complete` action with the signed-in session. */
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
    throw error;
  }
}

/** The code the popup posted for this function, when the message came from our edge function. */
export function popupConnectCode(
  event: MessageEvent,
  provider: GoogleConnectFunction,
  supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL,
): GoogleConnectCode | null {
  if (
    !URL.canParse(supabaseUrl) ||
    event.origin !== new URL(supabaseUrl).origin
  ) {
    return null;
  }

  const message = popupMessageSchema.safeParse(event.data);
  if (!message.success || message.data.provider !== provider) {
    return null;
  }

  const { code, state } = message.data;

  return { provider, code, state };
}

/**
 * Opens Google's consent screen in a popup and resolves once the connect is
 * completed for the signed-in user. Rejects when the popup is blocked, closed
 * first, or `complete` fails.
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

  return new Promise<void>((resolve, reject) => {
    let closedTimer = 0;
    function stop() {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedTimer);
    }
    function onMessage(event: MessageEvent) {
      const code = popupConnectCode(event, provider);
      if (!code) {
        return;
      }
      stop();
      completeGoogleConnect(code).then(resolve, reject);
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

/** The code a full-page connect left in the URL fragment, or null. */
export function fragmentConnectCode(hash: string): GoogleConnectCode | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = connectCodeSchema.safeParse({
    provider: params.get(CONNECT_FRAGMENT_KEY),
    code: params.get("code"),
    state: params.get("state"),
  });

  return code.success ? code.data : null;
}
