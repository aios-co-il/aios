// The answer of a full-page connect callback (Analytics, Search Console, Ads):
// a redirect to the integrations page with the code, or the error, in the URL
// fragment, which never reaches a server. The app completes the code with the
// user's session (see connect-handoff.ts and src/lib/googleConnectFragment.ts).
import { appReturnOrigin } from "./app-origin.ts";
import {
  CONNECT_FRAGMENT_KEY,
  type FragmentHandoff,
  type GoogleConnectFunction,
} from "./handoff-contract.ts";
import type { OAuthState } from "./oauth-state.ts";

/** The slug for a callback whose tenant is unknown; the app sends the user to their own tenant. */
export const UNKNOWN_TENANT_SLUG = "app";

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
 * A 302 to the integrations page with Google's error (or invalid_state) in
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

/** A 302 to the integrations page on the app origin, carrying the values in the URL fragment. */
function integrationsRedirect(
  origin: string | null,
  tenantSlug: string,
  fragment: FragmentHandoff,
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
