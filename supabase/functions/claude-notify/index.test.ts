import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const SERVICE_KEY = "service-role-key-of-this-project";
const BEARER = "claude-mcp-bearer";

/** A ping to the deployed handler with this bearer (none when undefined). */
const ping = (token?: string) =>
  new Request(`${SUPABASE_URL}/functions/v1/claude-notify`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ ping: true }),
  });

/** Statuses the deployed handler answers to these bearers, with CLAUDE_MCP_BEARER set or unset. */
async function statuses(bearer: string | null, tokens: (string | undefined)[]) {
  const http = fakeSupabaseHttp({ supabaseUrl: SUPABASE_URL });
  const env = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    CLAUDE_MCP_BEARER: bearer,
  };
  return await withRuntime({ env, fetch: http.fetch }, async () => {
    const handle = await servedHandler(new URL("./index.ts", import.meta.url));
    const out = [];
    for (const token of tokens) {
      out.push((await handle(ping(token))).status);
    }
    return out;
  });
}

Deno.test({
  name: "claude-notify index",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "accepts CLAUDE_MCP_BEARER and the service-role key from env",
      async () => {
        assertEquals(await statuses(BEARER, [BEARER, SERVICE_KEY]), [200, 200]);
      },
    );

    await t.step(
      "with CLAUDE_MCP_BEARER unset only the service-role key gets in",
      async () => {
        const [none, empty, guess, service] = await statuses(null, [
          undefined,
          "",
          "undefined",
          SERVICE_KEY,
        ]);
        assertStrictEquals(none, 401);
        assertStrictEquals(empty, 401);
        assertStrictEquals(guess, 401);
        assertStrictEquals(service, 200);
      },
    );
  },
});
