import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";
import { ANON_KEY, jwt, SERVICE_KEY } from "./test-fixtures.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const GATEWAY = "https://gateway.test";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBER = jwt({ role: "authenticated", sub: "member" });
const OUTSIDER = jwt({ role: "authenticated", sub: "outsider" });
const ALLOWED_PHONE = "972501234567";

/** Carmen's Manus line of TENANT. */
const LINE = {
  id: "manus-1",
  tenant_id: TENANT,
  api_key: "key-1",
  settings: { instance_id: "inst-1" },
};

type Call = { token: string; body: Record<string, unknown> };

/** Runs these requests through the deployed handler on Staging; returns each status and body, and the gateway posts. */
async function run(calls: Call[], failing: Record<string, string> = {}) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: {
      tenant_integrations: [LINE],
      tenant_users: [{ tenant_id: TENANT, user_id: "member" }],
    },
    users: { [MEMBER]: "member", [OUTSIDER]: "outsider" },
    rpc: { is_super_admin: () => false },
    failing,
    other: () => Response.json({ success: true }),
  });
  const env = {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    MANUS_GATEWAY_URL: GATEWAY,
    APP_ENV: "staging",
    STAGING_SAFE_MODE: "true",
    STAGING_ALLOWED_PHONE_NUMBERS: ALLOWED_PHONE,
  };
  const replies = await withRuntime({ env, fetch: http.fetch }, async () => {
    const handle = await servedHandler(new URL("./index.ts", import.meta.url));
    const out = [];
    for (const { token, body } of calls) {
      const res = await handle(
        new Request(`${SUPABASE_URL}/functions/v1/manage-manus-wa`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }),
      );
      out.push({ status: res.status, body: await res.json() });
    }
    return out;
  });
  const gateway = http.calls.filter((c) => c.url.origin === GATEWAY);
  return { replies, gateway, http };
}

/** A send_message body from Carmen's line. */
const send = (phone = ALLOWED_PHONE) => ({
  action: "send_message",
  integrationId: "manus-1",
  phone,
  message: "שלום",
});

Deno.test({
  name: "manage-manus-wa index",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "the anon key gets 401 on every action, before any read or send",
      async () => {
        const actions = ["create_instance", "get_qr_link", "get_status"];
        const { replies, http } = await run([
          ...actions.map((action) => ({ token: ANON_KEY, body: { action } })),
          { token: ANON_KEY, body: send() },
        ]);
        assertEquals(
          replies.map((r) => r.status),
          [401, 401, 401, 401],
        );
        assertStrictEquals(http.calls.length, 0);
      },
    );

    await t.step(
      "send_message: a user outside the line's tenant gets 403 and nothing is sent; a member's send goes out",
      async () => {
        const { replies, gateway } = await run([
          { token: OUTSIDER, body: send() },
          { token: MEMBER, body: send() },
        ]);
        assertEquals(replies[0], { status: 403, body: { error: "Forbidden" } });
        assertStrictEquals(replies[1].status, 200);
        assertStrictEquals(gateway.length, 1);
        assertStrictEquals(
          gateway[0].url.pathname,
          "/api/v1/instances/inst-1/send/text",
        );
        assertEquals(gateway[0].body, { to: ALLOWED_PHONE, body: "שלום" });
      },
    );

    await t.step(
      "send_message: the Staging guard refuses a phone off the allowlist",
      async () => {
        const { replies, gateway } = await run([
          { token: SERVICE_KEY, body: send("0509999999") },
        ]);
        assertStrictEquals(replies[0].status, 403);
        assertStrictEquals(
          replies[0].body.error,
          "blocked_by_staging_safe_mode",
        );
        assertStrictEquals(gateway.length, 0);
      },
    );

    await t.step(
      "a failed integration lookup is a 500, not 'Integration not found'",
      async () => {
        const { replies, gateway } = await run(
          [{ token: MEMBER, body: send() }],
          { tenant_integrations: "permission denied for table" },
        );
        assertEquals(replies[0], {
          status: 500,
          body: { error: "Internal error" },
        });
        assertStrictEquals(gateway.length, 0);
      },
    );
  },
});
