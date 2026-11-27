import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

import { internalBrainRefusal } from "../carmen/brain-guard.ts";
import { fakeTables } from "../carmen/test-tables.ts";
import { fakeSupabase } from "../testing/fake-supabase.ts";
import { runTenantDenied } from "./run-tenant-access.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const ADMIN = "44444444-4444-4444-8444-444444444444";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARMEN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MALFORMED_IDS = "Invalid tenant_id or agent_id";

/** MEMBER_A belongs to TENANT_A only, ADMIN is a super admin, AGENT_B is TENANT_B's Carmen. */
const db = () =>
  fakeSupabase(
    {
      tenant_users: [{ tenant_id: TENANT_A, user_id: MEMBER_A }],
      ai_agents: [{ id: AGENT_B, tenant_id: TENANT_B }],
    },
    { rpc: { is_super_admin: ({ _user_id }) => _user_id === ADMIN } },
  );

const user = (userId: string) => ({ kind: "user" as const, userId });

/** TENANT_A's Carmen, switched off for MEMBER_A. */
function carmenSwitchedOff() {
  const carmen = { tenant_id: TENANT_A, agent_id: CARMEN_A };

  return fakeTables({
    ai_agents: [{ id: CARMEN_A, name: "כרמן", tenant_id: TENANT_A }],
    carmen_command_center_access: [
      { ...carmen, user_id: MEMBER_A, enabled: false },
    ],
  });
}

/**
 * What the handler's two checks answer MEMBER_A, in its order (index.ts): the
 * tenant guard, then the grant for Carmen's main brain, which is switched off.
 */
async function memberRunRefusal(
  body: Record<string, unknown>,
): Promise<string | null> {
  const tenantDenied = await runTenantDenied(db(), user(MEMBER_A), body);
  if (tenantDenied) {
    return tenantDenied;
  }

  return await internalBrainRefusal(carmenSwitchedOff(), user(MEMBER_A), {
    tenantId: body.tenant_id,
    agentId: body.agent_id,
  });
}

/** MEMBER_A's refusal for a body, and the tables the guard read to reach it. */
async function refusalAndReads(body: Record<string, unknown>) {
  const sb = db();
  const denied = await runTenantDenied(sb, user(MEMBER_A), body);

  return { denied, reads: sb.queries.map((query) => query.table) };
}

Deno.test("runTenantDenied", async (t) => {
  await t.step("refuses a user who names another tenant", async () => {
    const denied = await runTenantDenied(db(), user(MEMBER_A), {
      tenant_id: TENANT_B,
    });
    assertStrictEquals(denied, "Not a member of this organization");
  });

  await t.step(
    "refuses another tenant's agent without a tenant_id",
    async () => {
      const denied = await runTenantDenied(db(), user(MEMBER_A), {
        agent_id: AGENT_B,
      });
      assertStrictEquals(denied, "Not a member of this organization");
    },
  );

  await t.step(
    "refuses another tenant's agent under the user's own tenant",
    async () => {
      const denied = await runTenantDenied(db(), user(MEMBER_A), {
        tenant_id: TENANT_A,
        agent_id: AGENT_B,
      });
      assertStrictEquals(denied, "This agent belongs to another organization");
    },
  );

  await t.step("lets a member run in their own tenant", async () => {
    const denied = await runTenantDenied(db(), user(MEMBER_A), {
      tenant_id: TENANT_A,
    });
    assertStrictEquals(denied, null);
  });

  await t.step("lets a super admin run in any tenant", async () => {
    const denied = await runTenantDenied(db(), user(ADMIN), {
      tenant_id: TENANT_B,
    });
    assertStrictEquals(denied, null);
  });

  await t.step("leaves service calls as they were", async () => {
    const denied = await runTenantDenied(
      db(),
      { kind: "service", userId: null },
      { tenant_id: TENANT_B },
    );
    assertStrictEquals(denied, null);
  });
});

// The run reads the body's raw ids, and supabase-js sends .eq("tenant_id", [id])
// as tenant_id=eq.<id>, so an id the guard cannot read as text still names a row (AIO-659).
Deno.test("runTenantDenied: ids that are not uuid strings", async (t) => {
  await t.step(
    "refuses another tenant's id wrapped in an array, before any read",
    async () => {
      for (const body of [
        { tenant_id: [TENANT_B] },
        // A well-formed agent must not be looked up before the refusal either.
        { tenant_id: [TENANT_B], agent_id: AGENT_B },
      ]) {
        assertEquals(
          await refusalAndReads(body),
          { denied: MALFORMED_IDS, reads: [] },
          JSON.stringify(body),
        );
      }
    },
  );

  await t.step(
    "a user with Carmen switched off cannot skip that check with an array",
    async () => {
      const asText = await memberRunRefusal({ tenant_id: TENANT_A });
      assertStrictEquals(typeof asText, "string");
      assertStrictEquals(asText === MALFORMED_IDS, false);

      assertStrictEquals(
        await memberRunRefusal({ tenant_id: [TENANT_A] }),
        MALFORMED_IDS,
      );
    },
  );

  for (const [spelling, agentId] of Object.entries({
    "without hyphens": AGENT_B.replaceAll("-", ""),
    "in braces": `{${AGENT_B}}`,
    "in an array": [AGENT_B],
  })) {
    await t.step(`refuses another tenant's agent ${spelling}`, async () => {
      for (const body of [
        { agent_id: agentId },
        { tenant_id: TENANT_A, agent_id: agentId },
      ]) {
        assertEquals(
          await refusalAndReads(body),
          { denied: MALFORMED_IDS, reads: [] },
          JSON.stringify(body),
        );
      }
    });
  }

  for (const [shape, tenantId] of Object.entries({
    "an object": { id: TENANT_B },
    "an object with a toString that is no function": { toString: "x" },
    "a number": 7,
    zero: 0,
    padded: ` ${TENANT_A} `,
  })) {
    await t.step(`refuses a tenant_id that is ${shape}`, async () => {
      assertEquals(await refusalAndReads({ tenant_id: tenantId }), {
        denied: MALFORMED_IDS,
        reads: [],
      });
    });
  }

  await t.step("absent, null and empty ids run as before", async () => {
    for (const body of [
      {},
      { tenant_id: null, agent_id: null },
      { tenant_id: "", agent_id: "" },
      { tenant_id: TENANT_A, agent_id: null },
    ]) {
      const denied = await runTenantDenied(db(), user(MEMBER_A), body);
      assertStrictEquals(denied, null, JSON.stringify(body));
    }
  });

  await t.step("leaves service calls as they were", async () => {
    const denied = await runTenantDenied(
      db(),
      { kind: "service", userId: null },
      { tenant_id: [TENANT_B], agent_id: AGENT_B.replaceAll("-", "") },
    );
    assertStrictEquals(denied, null);
  });
});

// The shape check lives in runTenantDenied, so nothing may read a user's body before it.
Deno.test(
  "run-ai-agent checks the body's ids before any other read of the body",
  () => {
    const entry = readFileSync(
      new URL("../../run-ai-agent/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(
      entry,
      /import \{ handleRequest \} from "\.\/request\/handle\.ts";/,
    );
    assertMatch(entry, /Deno\.serve\(handleRequest\);/);
    const agent = readFileSync(
      new URL("../../run-ai-agent/request/handle.ts", import.meta.url),
      "utf8",
    );
    assertMatch(
      agent,
      /return handleRequestWithDependencies\(req, REQUEST_DEPENDENCIES\);/,
    );
    const serve = agent.slice(
      agent.indexOf("export async function handleRequestWithDependencies("),
    );
    const bind = "bindRunAgentCaller(bodyJson, auth);";
    const bindAt = serve.indexOf(bind);
    const guardAt = serve.indexOf("await dependencies.runTenantDenied(");
    assert(bindAt > 0, "Deno.serve must call bindRunAgentCaller");
    assert(guardAt > bindAt, "runTenantDenied must follow the binding");

    // Between the two, only the direct tool reads the body, and only for a service caller.
    const between = serve.slice(bindAt + bind.length, guardAt);
    assertEquals(between.match(/bodyJson(\.\w+)?/g), [
      "bodyJson.direct_tool",
      "bodyJson.direct_tool",
      "bodyJson",
    ]);
    assertMatch(
      between,
      /if \(bodyJson\.direct_tool && auth\.kind !== "service"\) \{\s*return new Response\([^;]*\);\s*\}/,
    );

    assertMatch(
      between,
      /if \(bodyJson\.direct_tool\) \{\s*return await dependencies\.handleDirectTool\(bodyJson, supabase\);/,
    );

    assertMatch(
      serve.slice(guardAt),
      /^await dependencies\.runTenantDenied\(\s*supabase,\s*auth,\s*bodyJson,?\s*\);\s*if \(tenantDenied\) \{\s*return new Response\(/,
    );
  },
);
