import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import {
  accountFromIdToken,
  buildAuthorizeUrl,
  exchangeCode,
  microsoftOAuthConfig,
  PERSONAL_ACCOUNT_TENANT_ID,
} from "./graph-oauth.ts";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.supabase.co/functions/v1/microsoft-auth",
};

const tenantId = "22222222-2222-4222-8222-222222222222";

/** An unsigned JWT carrying the given claims, as the token endpoint shapes it. */
function idToken(claims: Record<string, unknown>): string {
  const part = (v: unknown) =>
    btoa(JSON.stringify(v))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${part({ alg: "none" })}.${part(claims)}.sig`;
}

Deno.test("authorize URL uses the common authority and offline access", () => {
  const url = new URL(buildAuthorizeUrl(config, "s"));
  assertEquals(url.pathname, "/common/oauth2/v2.0/authorize");
  assertEquals(url.searchParams.get("redirect_uri"), config.redirectUri);
  assertEquals(url.searchParams.get("state"), "s");
  assert(url.searchParams.get("scope")?.includes("offline_access"));
});

Deno.test("config throws when a credential is missing", () => {
  let threw = false;
  try {
    microsoftOAuthConfig(() => undefined);
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test("work account comes from a non-personal tenant id", () => {
  const account = accountFromIdToken(
    idToken({ tid: tenantId, email: "a@contoso.com" }),
  );
  assertEquals(account, {
    email: "a@contoso.com",
    msTenantId: tenantId,
    accountType: "work",
  });
});

Deno.test("personal account falls back to preferred_username", () => {
  const account = accountFromIdToken(
    idToken({
      tid: PERSONAL_ACCOUNT_TENANT_ID,
      preferred_username: "me@outlook.com",
    }),
  );
  assertEquals(account.accountType, "personal");
  assertEquals(account.email, "me@outlook.com");
});

Deno.test("exchangeCode maps the token response", async () => {
  const now = 1_700_000_000_000;
  const fakeFetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 3600,
          scope: "User.Read",
          id_token: "x.y.z",
        }),
      ),
    )) as typeof fetch;
  const tokens = await exchangeCode(config, "code", fakeFetch, now);
  assertEquals(tokens.accessToken, "at");
  assertEquals(tokens.refreshToken, "rt");
  assertEquals(tokens.expiresAt.getTime(), now + 3_600_000);
});

Deno.test(
  "exchangeCode throws when Microsoft returns no refresh token",
  async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        }),
      )) as typeof fetch;
    await assertRejects(() => exchangeCode(config, "code", fakeFetch));
  },
);
