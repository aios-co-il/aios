import { assertEquals } from "jsr:@std/assert@1";
import { buildGmailAuthorizeUrl } from "./authorize-url.ts";

Deno.test(
  "the consent screen asks for gmail.modify and the account email only",
  () => {
    const url = new URL(
      buildGmailAuthorizeUrl({
        clientId: "client-1",
        redirectUri: "https://example.supabase.co/functions/v1/gmail-auth",
        state: "user-1|tenant-1",
      }),
    );

    assertEquals(url.searchParams.get("scope")?.split(" "), [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
    assertEquals(url.searchParams.get("state"), "user-1|tenant-1");
  },
);
