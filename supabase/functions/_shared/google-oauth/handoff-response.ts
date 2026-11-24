// The callback's answer: it hands the code (or the reason the connect failed)
// to the signed-in app instead of exchanging it (see connect-handoff.ts).
// Popup flows post it to the window that opened the popup; full-page flows put
// it in the URL fragment of the integrations page, which never reaches a server.
import { appReturnOrigin } from "./app-origin.ts";
import {
  CONNECT_CODE_MESSAGE,
  CONNECT_ERROR_MESSAGE,
  CONNECT_FRAGMENT_KEY,
  type GoogleConnectFunction,
} from "./handoff-contract.ts";
import {
  oauthStateSecret,
  type OAuthState,
  verifyOAuthState,
} from "./oauth-state.ts";

/** The slug for a callback whose tenant is unknown; the app sends the user to their own tenant. */
const UNKNOWN_TENANT_SLUG = "app";

const EXPIRED_LINK =
  "This connect link is invalid or has expired. Close this window and connect again.";

const NO_CONSENT =
  "Google did not grant access, so nothing was connected. Close this window and connect again.";

/**
 * Google's redirect back to a popup connect (Calendar, Gmail): hands the code
 * to the app when the state is ours, or tells the app why there is none.
 */
export async function popupCallbackResponse(
  provider: GoogleConnectFunction,
  url: URL,
  { requireTenant }: { requireTenant: boolean },
): Promise<Response> {
  const rawState = url.searchParams.get("state") ?? "";
  const state = await verifyOAuthState(rawState, oauthStateSecret());
  if (!state || (requireTenant && !state.tenantId)) {
    return popupErrorPage(provider, null, rawState, EXPIRED_LINK);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return popupErrorPage(provider, state, rawState, NO_CONSENT);
  }

  return popupHandoffPage(provider, state, code, rawState);
}

/** The popup's last page: posts the code and state to the app window that opened it, and closes. */
function popupHandoffPage(
  provider: GoogleConnectFunction,
  state: OAuthState,
  code: string,
  rawState: string,
): Response {
  return popupPage(
    {
      type: CONNECT_CODE_MESSAGE,
      provider,
      code,
      state: rawState,
    },
    appReturnOrigin(state.origin),
    "מסיים את החיבור... החלון ייסגר אוטומטית.",
  );
}

/**
 * The popup's last page when the connect failed before a code was handed
 * over (consent refused, link expired): posts the reason to the opener, which
 * shows it, and shows it in the popup too. Without a verified state the app's
 * origin is unknown, so the message goes to any opener; it carries only the
 * state already in this URL and text meant for the user.
 */
function popupErrorPage(
  provider: GoogleConnectFunction,
  state: OAuthState | null,
  rawState: string,
  message: string,
): Response {
  return popupPage(
    { type: CONNECT_ERROR_MESSAGE, provider, state: rawState, error: message },
    state ? appReturnOrigin(state.origin) : "*",
    message,
  );
}

/** A 302 to the tenant's integrations page with the code and state in the fragment. */
export function redirectHandoff(
  provider: GoogleConnectFunction,
  state: OAuthState,
  tenantSlug: string,
  code: string,
  rawState: string,
): Response {
  return integrationsRedirect(state.origin, tenantSlug, {
    [CONNECT_FRAGMENT_KEY]: provider,
    code,
    state: rawState,
  });
}

/**
 * A 302 to the integrations page with Google's error (or `invalid_state`) in
 * the fragment, which the app shows. Without a verified state the tenant and
 * origin are unknown, so it goes to APP_URL.
 */
export function redirectHandoffError(
  provider: GoogleConnectFunction,
  state: OAuthState | null,
  tenantSlug: string | null,
  error: string,
): Response {
  return integrationsRedirect(
    state?.origin ?? null,
    tenantSlug ?? UNKNOWN_TENANT_SLUG,
    { [CONNECT_FRAGMENT_KEY]: provider, error },
  );
}

function integrationsRedirect(
  origin: string | null,
  tenantSlug: string,
  fragment: Record<string, string>,
): Response {
  const target = new URL(
    `/t/${encodeURIComponent(tenantSlug)}/integrations`,
    appReturnOrigin(origin),
  );
  target.hash = new URLSearchParams(fragment).toString();

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
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
    <p>${escapeHtml(text)}</p>
  </body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** JSON safe inside an inline <script>: `<` is escaped so a value cannot close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
