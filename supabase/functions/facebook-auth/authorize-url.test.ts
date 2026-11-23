import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildFacebookAuthorizeUrl } from "./authorize-url.ts";

Deno.test("the login dialog requests the page webhook permission", () => {
  assert(requestedScopes().includes("pages_manage_metadata"));
});

Deno.test("the login dialog does not request Messenger", () => {
  assertEquals(requestedScopes().includes("pages_messaging"), false);
});

Deno.test("the login dialog lists each permission once", () => {
  const scopes = requestedScopes();

  assertEquals(new Set(scopes).size, scopes.length);
});

Deno.test("the login dialog carries the app, callback and state", () => {
  const url = new URL(buildFacebookAuthorizeUrl(PARAMS));

  assertEquals(
    url.origin + url.pathname,
    "https://www.facebook.com/v21.0/dialog/oauth",
  );
  assertEquals(url.searchParams.get("client_id"), PARAMS.appId);
  assertEquals(url.searchParams.get("redirect_uri"), PARAMS.callbackUrl);
  assertEquals(url.searchParams.get("state"), PARAMS.state);
});

const PARAMS = {
  appId: "app-1",
  callbackUrl:
    "https://example.supabase.co/functions/v1/facebook-auth?action=oauth_callback",
  state: "tenant-1:state-1",
};

function requestedScopes(): Array<string> {
  const url = new URL(buildFacebookAuthorizeUrl(PARAMS));

  return (url.searchParams.get("scope") ?? "").split(",");
}
