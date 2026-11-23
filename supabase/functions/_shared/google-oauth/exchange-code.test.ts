import { assertEquals } from "jsr:@std/assert@1";
import { withRuntime } from "../testing/served-handler.ts";
import { callbackUri } from "./exchange-code.ts";

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
