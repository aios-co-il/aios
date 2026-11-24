// The last page of a popup connect (Calendar, Gmail): it posts the code, or
// why there is none, to the app window that opened the popup, and closes.
// The app completes the code with the user's session (see connect-handoff.ts).
import { appReturnOrigin } from "./app-origin.ts";
import {
  CONNECT_CODE_MESSAGE,
  CONNECT_ERROR_MESSAGE,
  CONSENT_REFUSED_ERROR,
  type GoogleConnectFunction,
  INVALID_STATE_ERROR,
} from "./handoff-contract.ts";
import {
  oauthStateSecret,
  type OAuthState,
  verifyOAuthState,
} from "./oauth-state.ts";

const FINISHING_TEXT = "מסיים את החיבור... החלון ייסגר אוטומטית.";

const FAILED_TEXT = "החיבור לא הושלם. החלון ייסגר אוטומטית.";

/** Google's redirect back to a popup connect: hands the code to the app when the state is ours, else tells it why not. */
export async function popupCallbackResponse(
  provider: GoogleConnectFunction,
  url: URL,
  { requireTenant }: { requireTenant: boolean },
): Promise<Response> {
  const rawState = url.searchParams.get("state") ?? "";
  const state = await verifyOAuthState(rawState, oauthStateSecret());
  if (!state || (requireTenant && !state.tenantId)) {
    return popupErrorPage(provider, null, rawState, INVALID_STATE_ERROR);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    const error = url.searchParams.get("error") || CONSENT_REFUSED_ERROR;
    return popupErrorPage(provider, state, rawState, error);
  }

  return popupPage(
    { type: CONNECT_CODE_MESSAGE, provider, code, state: rawState },
    appReturnOrigin(state.origin),
    FINISHING_TEXT,
  );
}

/**
 * Posts the error code to the opener. Without a verified state the app's
 * origin is unknown, so it goes to any opener; it carries only the state
 * already in this URL and the error code.
 */
function popupErrorPage(
  provider: GoogleConnectFunction,
  state: OAuthState | null,
  rawState: string,
  error: string,
): Response {
  return popupPage(
    { type: CONNECT_ERROR_MESSAGE, provider, state: rawState, error },
    state ? appReturnOrigin(state.origin) : "*",
    FAILED_TEXT,
  );
}

function popupPage(message: unknown, target: string, text: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html>
  <head>
    <title>Google</title>
    <script>
      window.opener?.postMessage(${scriptJson(message)}, ${scriptJson(target)});
      setTimeout(() => window.close(), 1000);
    </script>
  </head>
  <body style="font-family: system-ui; text-align: center; padding: 50px;">
    <p>${text}</p>
  </body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** JSON safe inside an inline <script>: `<` is escaped so a value cannot close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\u003c");
}
