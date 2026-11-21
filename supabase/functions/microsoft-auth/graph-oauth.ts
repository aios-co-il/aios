/**
 * Microsoft identity platform (Entra ID) OAuth for Microsoft Graph: the
 * authorize URL, code exchange and the signed-in account. One multi-tenant
 * app serves work/school (Microsoft 365) and personal (outlook.com) accounts
 * through the `common` authority.
 */

const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

/** Entra tenant id that every personal Microsoft account signs in through. */
export const PERSONAL_ACCOUNT_TENANT_ID =
  "9188040d-6c67-4c5b-b112-36a304b66dad";

/** Sign-in scopes; later phases (mail, calendar, …) add theirs to this list (AIO-322). */
export const BASE_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
];

export type MicrosoftOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type MicrosoftTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  idToken: string | null;
};

export type MicrosoftAccount = {
  email: string | null;
  msTenantId: string | null;
  accountType: "work" | "personal";
};

import { base64UrlDecode } from "./base64url.ts";

type FetchFn = typeof fetch;

/** The app's credentials from MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET; throws when either is unset. */
export function microsoftOAuthConfig(
  env: (key: string) => string | undefined = (k) => Deno.env.get(k),
): MicrosoftOAuthConfig {
  const clientId = env("MICROSOFT_CLIENT_ID");
  const clientSecret = env("MICROSOFT_CLIENT_SECRET");
  const supabaseUrl = env("SUPABASE_URL");
  if (!clientId || !clientSecret || !supabaseUrl) {
    throw new Error("Microsoft OAuth is not configured");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${supabaseUrl}/functions/v1/microsoft-auth`,
  };
}

/** The Microsoft consent URL for the given signed state and scopes. */
export function buildAuthorizeUrl(
  config: MicrosoftOAuthConfig,
  state: string,
  scopes: Array<string> = BASE_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: scopes.join(" "),
    prompt: "select_account",
    state,
  });
  return `${AUTHORITY}/authorize?${params}`;
}

async function tokenRequest(
  config: MicrosoftOAuthConfig,
  grant: Record<string, string>,
  fetchFn: FetchFn,
  now: number,
): Promise<MicrosoftTokenSet> {
  const res = await fetchFn(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      ...grant,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token || !json.refresh_token) {
    // Log the provider's error code only; the body can echo request values.
    console.error("Microsoft token request failed", res.status, json.error);
    throw new Error(
      `Microsoft token request failed: ${json.error ?? res.status}`,
    );
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(now + Number(json.expires_in ?? 3600) * 1000),
    scope: String(json.scope ?? ""),
    idToken: typeof json.id_token === "string" ? json.id_token : null,
  };
}

/** Exchanges the callback's authorization code for tokens. */
export function exchangeCode(
  config: MicrosoftOAuthConfig,
  code: string,
  fetchFn: FetchFn = fetch,
  now: number = Date.now(),
): Promise<MicrosoftTokenSet> {
  return tokenRequest(
    config,
    { grant_type: "authorization_code", code, scope: BASE_SCOPES.join(" ") },
    fetchFn,
    now,
  );
}

/**
 * The signed-in account from the ID token. The token comes straight from
 * Microsoft's token endpoint over TLS, so its claims are read without
 * verifying the signature.
 */
export function accountFromIdToken(idToken: string | null): MicrosoftAccount {
  let claims: Record<string, unknown> = {};
  const payload = idToken?.split(".")[1];
  if (payload) {
    try {
      claims = JSON.parse(base64UrlDecode(payload));
    } catch (e) {
      console.error("Microsoft id_token could not be read", e);
    }
  }
  const msTenantId = typeof claims.tid === "string" ? claims.tid : null;
  const email =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.preferred_username === "string" &&
      claims.preferred_username) ||
    null;
  return {
    email,
    msTenantId,
    accountType:
      msTenantId === PERSONAL_ACCOUNT_TENANT_ID ? "personal" : "work",
  };
}
