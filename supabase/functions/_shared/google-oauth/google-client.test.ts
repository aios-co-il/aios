import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { withRuntime } from "../testing/served-handler.ts";
import {
  type GoogleClient,
  gmailGoogleClient,
  sharedGoogleClient,
} from "./google-client.ts";

const SHARED = {
  GOOGLE_CLIENT_ID: "shared-client",
  GOOGLE_CLIENT_SECRET: "shared-secret",
};

/** Runs `read` under the given environment; the network is never used. */
function withEnv<T>(
  env: Record<string, string | null>,
  read: () => T,
): Promise<T> {
  return withRuntime({ env, fetch: globalThis.fetch }, () =>
    Promise.resolve(read()),
  );
}

Deno.test("Gmail uses its own client when both secrets are set", async () => {
  const client: GoogleClient = await withEnv(
    {
      ...SHARED,
      GMAIL_GOOGLE_CLIENT_ID: "gmail-client",
      GMAIL_GOOGLE_CLIENT_SECRET: "gmail-secret",
    },
    gmailGoogleClient,
  );

  assertEquals(client, {
    clientId: "gmail-client",
    clientSecret: "gmail-secret",
  });
});

Deno.test("Gmail shares the common client without its own", async () => {
  const client: GoogleClient = await withEnv(
    {
      ...SHARED,
      GMAIL_GOOGLE_CLIENT_ID: null,
      GMAIL_GOOGLE_CLIENT_SECRET: null,
    },
    gmailGoogleClient,
  );

  assertEquals(client, {
    clientId: "shared-client",
    clientSecret: "shared-secret",
  });
});

Deno.test("half of Gmail's own client is refused, not mixed", async () => {
  await withEnv(
    {
      ...SHARED,
      GMAIL_GOOGLE_CLIENT_ID: "gmail-client",
      GMAIL_GOOGLE_CLIENT_SECRET: null,
    },
    () => assertThrows(gmailGoogleClient, Error, "must be set together"),
  );
});

Deno.test("the common client is refused without its secret", async () => {
  await withEnv(
    { GOOGLE_CLIENT_ID: "shared-client", GOOGLE_CLIENT_SECRET: null },
    () =>
      assertThrows(
        sharedGoogleClient,
        Error,
        "GOOGLE_CLIENT_SECRET is not set",
      ),
  );
});
