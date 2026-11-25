import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { withRuntime } from "../testing/served-handler.ts";
import { callbackUri, exchangeGoogleCode } from "./exchange-code.ts";

const SUPABASE_URL = "https://project-ref.supabase.co";

/** callbackUri under the given environment; the network is never used. */
function uriWith(
  env: Record<string, string | null>,
  functionName: string,
  action: string | null,
): Promise<string> {
  return withRuntime({ env, fetch: globalThis.fetch }, () =>
    Promise.resolve(callbackUri(functionName, action)),
  );
}

Deno.test(
  "the callback uses the custom domain when PUBLIC_API_URL is set",
  async () => {
    assertEquals(
      await uriWith(
        { SUPABASE_URL, PUBLIC_API_URL: "https://api.aios.co.il/" },
        "google-calendar-auth",
        "callback",
      ),
      "https://api.aios.co.il/functions/v1/google-calendar-auth?action=callback",
    );
  },
);

Deno.test(
  "the callback keeps the project address without PUBLIC_API_URL",
  async () => {
    assertEquals(
      await uriWith({ SUPABASE_URL, PUBLIC_API_URL: null }, "gmail-auth", null),
      "https://project-ref.supabase.co/functions/v1/gmail-auth",
    );
  },
);

Deno.test("a custom domain with a path keeps only its origin", async () => {
  assertEquals(
    await uriWith(
      { SUPABASE_URL, PUBLIC_API_URL: "https://api.aios.co.il/extra/" },
      "gmail-auth",
      null,
    ),
    "https://api.aios.co.il/functions/v1/gmail-auth",
  );
});

Deno.test("a base without a scheme is refused", async () => {
  await assertRejects(
    () =>
      uriWith(
        { SUPABASE_URL, PUBLIC_API_URL: "api.aios.co.il" },
        "gmail-auth",
        null,
      ),
    Error,
    "PUBLIC_API_URL or SUPABASE_URL",
  );
});

Deno.test("no base URL at all is refused", async () => {
  await assertRejects(
    () =>
      uriWith({ SUPABASE_URL: null, PUBLIC_API_URL: null }, "gmail-auth", null),
    Error,
    "PUBLIC_API_URL or SUPABASE_URL",
  );
});

Deno.test(
  "the code exchange refuses to run without the client secret",
  async () => {
    await assertRejects(
      () =>
        withRuntime(
          {
            env: {
              GOOGLE_CLIENT_ID: "test-client",
              GOOGLE_CLIENT_SECRET: null,
            },
            fetch: () => Promise.reject(new Error("Google was called")),
          },
          () => exchangeGoogleCode("code", "https://api.aios.co.il/cb"),
        ),
      Error,
      "GOOGLE_CLIENT_SECRET is not set",
    );
  },
);
