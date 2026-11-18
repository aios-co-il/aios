import { assertEquals } from "jsr:@std/assert@1";
import { missingGrantedScopes } from "./granted-scopes.ts";

Deno.test("lists the required scopes the user did not grant", () => {
  assertEquals(
    missingGrantedScopes({ scope: "openid email" }, ["email", "gmail"]),
    ["gmail"],
  );
});

Deno.test("treats a token response without scope as granting nothing", () => {
  assertEquals(missingGrantedScopes({}, ["gmail"]), ["gmail"]);
});
