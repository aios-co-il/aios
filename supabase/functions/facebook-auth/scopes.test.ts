import { assert, assertEquals } from "jsr:@std/assert@1";
import { FACEBOOK_LOGIN_SCOPES } from "./scopes.ts";

Deno.test("facebook login requests the page webhook permission", () => {
  assert(FACEBOOK_LOGIN_SCOPES.includes("pages_manage_metadata"));
});

Deno.test("facebook login does not request Messenger", () => {
  assertEquals(FACEBOOK_LOGIN_SCOPES.includes("pages_messaging"), false);
});

Deno.test("facebook login lists each permission once", () => {
  assertEquals(
    new Set(FACEBOOK_LOGIN_SCOPES).size,
    FACEBOOK_LOGIN_SCOPES.length,
  );
});
