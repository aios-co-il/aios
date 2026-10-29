import {
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

import { withConsoleErrors } from "../_shared/testing/console-errors.ts";
import { fakeSupabaseHttp } from "../_shared/testing/fake-supabase-http.ts";
import {
  servedHandler,
  withRuntime,
} from "../_shared/testing/served-handler.ts";

const SUPABASE_URL = "https://this-project.supabase.co";
const SERVICE_KEY = "service-role-key-of-this-project";
const GATEWAY = "https://whatsappgw-pzpyrrww.manus.space";
const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const SUPER = "44444444-4444-4444-8444-444444444444";
const FOREIGN_LINE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PHONE = "972501234567";

/** A Manus line of OTHER_TENANT that is not shared with TENANT. */
const FOREIGN = {
  id: FOREIGN_LINE,
  tenant_id: OTHER_TENANT,
  user_id: null,
  integration_type: "manus_wa",
  is_active: true,
  api_key: "key-foreign",
  settings: { instance_id: "inst-foreign" },
};

/** A service-role send for TENANT as `senderUserId` from FOREIGN. */
const send = (senderUserId: string) => ({
  tenantId: TENANT,
  senderUserId,
  integrationId: FOREIGN_LINE,
  phoneNumber: PHONE,
  message: "שלום",
});

/** Runs the deployed handler on Staging; returns each reply, the gateway posts and what it logged as errors. */
async function run(
  bodies: Record<string, unknown>[],
  failing: Record<string, string> = {},
) {
  const http = fakeSupabaseHttp({
    supabaseUrl: SUPABASE_URL,
    tables: {
      tenant_integrations: [FOREIGN],
      tenant_users: [{ tenant_id: TENANT, user_id: MEMBER }],
    },
    rpc: {
      is_super_admin: ({ _user_id }) => _user_id === SUPER,
      tenant_can_use_integration: () => false,
    },
    failing,
    other: () => Response.json({ success: true, messageId: "m1" }),
  });
  const env = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    APP_ENV: "staging",
    STAGING_SAFE_MODE: "true",
    STAGING_ALLOWED_PHONE_NUMBERS: PHONE,
  };
  const { result: replies, logged } = await withConsoleErrors(() =>
    withRuntime({ env, fetch: http.fetch }, async () => {
      const handle = await servedHandler(
        new URL("./index.ts", import.meta.url),
      );
      const out = [];
      for (const body of bodies) {
        const res = await handle(
          new Request(`${SUPABASE_URL}/functions/v1/send-manus-wa-message`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_KEY}` },
            body: JSON.stringify(body),
          }),
        );
        out.push({ status: res.status, body: await res.json() });
      }
      return out;
    }),
  );
  const gateway = http.calls.filter((c) => c.url.origin === GATEWAY);
  return { replies, gateway, http, logged };
}

Deno.test({
  name: "send-manus-wa-message index",
  // supabase-js starts an unref'd auth refresh timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    await t.step(
      "a failed membership or super-admin lookup is a generic 500; the cause is logged",
      async () => {
        const cases = [
          ["tenant_users", "tenant_users lookup failed: permission denied"],
          ["is_super_admin", "is_super_admin failed: permission denied"],
        ];
        for (const [failing, cause] of cases) {
          const { replies, gateway, logged } = await run([send(MEMBER)], {
            [failing]: "permission denied for table tenant_users",
          });
          assertEquals(
            replies[0],
            { status: 500, body: { error: "Internal error" } },
            failing,
          );
          assertStrictEquals(gateway.length, 0, failing);
          assertStringIncludes(logged, cause);
        }
      },
    );

    await t.step(
      "a failed sharing lookup is a generic 500 and nothing is sent",
      async () => {
        const { replies, gateway } = await run([send(MEMBER)], {
          tenant_can_use_integration: "statement timeout",
        });
        assertEquals(replies[0], {
          status: 500,
          body: { error: "Internal error" },
        });
        assertStrictEquals(gateway.length, 0);
      },
    );

    await t.step(
      "a sender id that is not a uuid is refused 403 without a lookup",
      async () => {
        const { replies, http } = await run([send("system")]);
        assertEquals(replies[0], { status: 403, body: { error: "Forbidden" } });
        const lookups = http.calls.filter(
          (c) =>
            c.url.pathname.endsWith("/tenant_users") ||
            c.url.pathname.endsWith("/is_super_admin"),
        );
        assertEquals(lookups, []);
      },
    );

    await t.step(
      "a super admin may send from another tenant's unshared line; a member may not",
      async () => {
        const { replies, gateway } = await run([send(MEMBER), send(SUPER)]);
        assertEquals(replies[0], {
          status: 400,
          body: { error: "Manus WhatsApp not configured" },
        });
        assertEquals(replies[1], {
          status: 200,
          body: { success: true, messageId: "m1" },
        });
        assertStrictEquals(gateway.length, 1);
        assertStrictEquals(
          gateway[0].url.pathname,
          "/api/v1/instances/inst-foreign/send/text",
        );
      },
    );
  },
});
