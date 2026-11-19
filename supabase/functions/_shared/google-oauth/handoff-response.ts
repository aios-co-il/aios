// The callback's answer once the state is verified: it hands the code to the
// signed-in app instead of exchanging it (see connect-handoff.ts). Popup flows
// post it to the window that opened the popup; full-page flows put it in the
// URL fragment of the integrations page, which never reaches a server.
import { appReturnOrigin } from "./app-origin.ts";
import type { OAuthState } from "./oauth-state.ts";

/** The message the popup posts to the app window that opened it (src/lib/googleConnect.ts reads it). */
const CONNECT_CODE_MESSAGE = "google_connect_code";

/** The URL fragment key the full-page flows carry the code in (src/lib/googleConnect.ts reads it). */
const CONNECT_FRAGMENT_KEY = "google_connect";

/** The popup's last page: posts the code and state to the app window that opened it, and closes. */
export function popupHandoffPage(
  provider: string,
  state: OAuthState,
  code: string,
  rawState: string,
): Response {
  const message = scriptJson({
    type: CONNECT_CODE_MESSAGE,
    provider,
    code,
    state: rawState,
  });
  const target = scriptJson(appReturnOrigin(state.origin));

  return new Response(
    `<!DOCTYPE html>
<html>
  <head>
    <title>Google</title>
    <script>
      window.opener?.postMessage(${message}, ${target});
      setTimeout(() => window.close(), 1000);
    </script>
  </head>
  <body style="font-family: system-ui; text-align: center; padding: 50px;">
    <p>מסיים את החיבור... החלון ייסגר אוטומטית.</p>
  </body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** A 302 to the tenant's integrations page with the code and state in the fragment. */
export function redirectHandoff(
  provider: string,
  state: OAuthState,
  tenantSlug: string,
  code: string,
  rawState: string,
): Response {
  const target = new URL(
    `/t/${encodeURIComponent(tenantSlug)}/integrations`,
    appReturnOrigin(state.origin),
  );
  target.hash = new URLSearchParams({
    [CONNECT_FRAGMENT_KEY]: provider,
    code,
    state: rawState,
  }).toString();

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
}

/** JSON safe inside an inline <script>: `<` is escaped so a value cannot close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
