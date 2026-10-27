import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import type { GuardResult } from "../_shared/integration-guard.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import {
  anonRefusal,
  manusSendRefusal,
  stagingBlockResponse,
} from "./send-guard.ts";
import { ANON_KEY, jwt, SERVICE_KEY } from "./test-fixtures.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };
const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const USER_TOKEN = jwt({ role: "authenticated", sub: USER });
const LINE = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", tenant_id: TENANT };

/** A client that knows USER_TOKEN but fails on the membership query. */
const failingDb = () =>
  fakeSupabase(
    {},
    {
      users: { [USER_TOKEN]: USER },
      failing: { tenant_users: "relation does not exist" },
    },
  );

Deno.test("anonRefusal", async (t) => {
  await t.step("refuses the public anon key on every action", async () => {
    const res = anonRefusal(`Bearer ${ANON_KEY}`, SERVICE_KEY, CORS);
    assertStrictEquals(res?.status, 401);
    assertEquals(await res?.json(), { error: "Unauthorized" });
    assertStrictEquals(res?.headers.get("Access-Control-Allow-Origin"), "*");
  });

  await t.step("lets the service key and user JWTs through", () => {
    assertStrictEquals(
      anonRefusal(`Bearer ${SERVICE_KEY}`, SERVICE_KEY, CORS),
      null,
    );
    assertStrictEquals(
      anonRefusal(`Bearer ${USER_TOKEN}`, SERVICE_KEY, CORS),
      null,
    );
  });
});

Deno.test("manusSendRefusal", async (t) => {
  await t.step(
    "answers 401 for a missing bearer before any lookup",
    async () => {
      const res = await manusSendRefusal(
        {
          authorization: "",
          serviceRoleKey: SERVICE_KEY,
          integration: LINE,
          supabase: failingDb(),
        },
        CORS,
      );
      assertStrictEquals(res?.status, 401);
    },
  );

  await t.step(
    "a failed membership lookup is a generic 500, never the DB text",
    async () => {
      const res = await manusSendRefusal(
        {
          authorization: `Bearer ${USER_TOKEN}`,
          serviceRoleKey: SERVICE_KEY,
          integration: LINE,
          supabase: failingDb(),
        },
        CORS,
      );
      assertStrictEquals(res?.status, 500);
      assertEquals(await res?.json(), { error: "Internal error" });
    },
  );

  await t.step("the service key may send", async () => {
    const res = await manusSendRefusal(
      {
        authorization: `Bearer ${SERVICE_KEY}`,
        serviceRoleKey: SERVICE_KEY,
        integration: null,
        supabase: failingDb(),
      },
      CORS,
    );
    assertStrictEquals(res, null);
  });
});

Deno.test("stagingBlockResponse", async (t) => {
  const guard = (decision: GuardResult["decision"]) => (): GuardResult => ({
    decision,
    reason: "destination_not_allowlisted",
    environment: "staging",
  });

  await t.step(
    "a blocked phone gets 403 blocked_by_staging_safe_mode",
    async () => {
      const res = stagingBlockResponse("972501234567", CORS, guard("BLOCK"));
      assertStrictEquals(res?.status, 403);
      assertEquals(await res?.json(), {
        error: "blocked_by_staging_safe_mode",
        reason: "destination_not_allowlisted",
        environment: "staging",
      });
    },
  );

  await t.step("an allowed phone goes on to the gateway", () => {
    assertStrictEquals(
      stagingBlockResponse("972501234567", CORS, guard("ALLOW")),
      null,
    );
  });
});
