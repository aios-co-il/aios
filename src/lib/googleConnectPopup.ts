import { z } from "zod";
import {
  CONNECT_CODE_MESSAGE,
  CONNECT_ERROR_MESSAGE,
  GOOGLE_CONNECT_FUNCTIONS,
  type GoogleConnectFunction,
  LOCAL_HOSTS,
  type PopupMessage,
} from "../../supabase/functions/_shared/google-oauth/handoff-contract.ts";
import { connectCodeSchema, type GoogleConnectCode } from "./googleConnectCode";

/**
 * Which popup messages belong to one connect attempt. The callback page
 * (supabase/functions/_shared/google-oauth/popup-handoff.ts) posts the code,
 * or an error code, to the window that opened the popup.
 */
export type PopupAttempt = {
  provider: GoogleConnectFunction;
  /** The state this attempt sent to Google. */
  state: string | null;
  /** The origin of the callback Google returns to, which posts the message. */
  callbackOrigin: string | null;
};

/** What the popup reported for this attempt: the code to complete, or Google's (or our) error code. */
export type PopupConnectResult =
  { code: GoogleConnectCode } | { error: string };

const popupMessageSchema: z.ZodType<PopupMessage> = z.discriminatedUnion(
  "type",
  [
    connectCodeSchema.extend({ type: z.literal(CONNECT_CODE_MESSAGE) }),
    z.object({
      type: z.literal(CONNECT_ERROR_MESSAGE),
      provider: z.enum(GOOGLE_CONNECT_FUNCTIONS),
      state: z.string(),
      error: z.string().min(1),
    }),
  ],
);

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

/** The redirect URI's origin when it is https (or http on a local host), else null. */
function callbackOrigin(redirectUri: string | null): string | null {
  // zod checks the URL without URL.canParse, which Safari before 17 and Chrome before 120 lack.
  const parsed = z.string().url().safeParse(redirectUri);
  if (!parsed.success) {
    return null;
  }

  const url = new URL(parsed.data);
  const local = LOCAL_HOSTS.includes(url.hostname);

  return url.protocol === "https:" || (local && url.protocol === "http:")
    ? url.origin
    : null;
}
