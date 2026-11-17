import { assertEquals } from "jsr:@std/assert@1";
import { GMAIL_SCOPES } from "./scopes.ts";

Deno.test(
  "gmail requests modify instead of separate read and send scopes",
  () => {
    assertEquals(GMAIL_SCOPES, [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  },
);
