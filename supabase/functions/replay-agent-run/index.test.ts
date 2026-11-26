import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1";

import {
  ANON_KEY,
  callRunFunction,
  MEMBER_A,
  MEMBER_B,
  otherSpellings,
  type RunCall,
  SERVICE_KEY,
  TENANT_A,
  TENANT_B,
  TOKEN_A,
} from "../_shared/agent-runs/run-wrapper.test-fixture.ts";

const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_A = "a0000000-0000-4000-8000-00000000000a";
const RUN_B = "b0000000-0000-4000-8000-00000000000b";

/** One finished run per tenant; TENANT_B's holds a goal TENANT_A must not copy. */
const TABLES = {
  ai_agents: [
    { id: AGENT_A, tenant_id: TENANT_A },
    { id: AGENT_B, tenant_id: TENANT_B },
  ],
  agent_runs: [
    { id: RUN_A, tenant_id: TENANT_A, agent_id: AGENT_A, goal: "weekly" },
    { id: RUN_B, tenant_id: TENANT_B, agent_id: AGENT_B, goal: "secret" },
  ],
};

/** What replay-agent-run answers to one request. */
function replay(call: RunCall) {
  return callRunFunction(new URL("./index.ts", import.meta.url), TABLES, call);
}

/** MEMBER_A replaying a run under a tenant. */
function asMemberA(body: Record<string, unknown>) {
  return replay({ token: TOKEN_A, body });
}

Deno.test("replay-agent-run: no valid caller", async (t) => {
  for (const [who, token] of [
    ["a request with no token", null],
    ["the anon key", ANON_KEY],
  ] as const) {
    await t.step(`${who} is answered 401 and starts nothing`, async () => {
      const result = await replay({
        token,
        body: { run_id: RUN_B, tenant_id: TENANT_B },
      });

      assertObjectMatch(result, { status: 401, reads: [], started: [] });
    });
  }

  await t.step("is answered 401 before the body is parsed", async () => {
    const result = await replay({ token: null, body: "{not json" });

    assertEquals(result.status, 401);
  });
});

Deno.test("replay-agent-run: a signed-in user", async (t) => {
  await t.step("may not replay under another tenant", async () => {
    const result = await asMemberA({ run_id: RUN_B, tenant_id: TENANT_B });

    assertObjectMatch(result, {
      status: 403,
      reply: { error: "Not a member of this organization" },
      started: [],
    });
    assertEquals(result.reads.includes("agent_runs"), false);
  });

  await t.step(
    "may not replay another tenant's run under their own tenant",
    async () => {
      const result = await asMemberA({ run_id: RUN_B, tenant_id: TENANT_A });

      assertObjectMatch(result, {
        status: 404,
        reply: { error: "source run not found" },
        started: [],
      });
    },
  );

  for (const [field, id] of [
    ["tenant_id", TENANT_B],
    ["run_id", RUN_B],
  ] as const) {
    for (const [spelling, value] of otherSpellings(id)) {
      await t.step(`is refused a ${field} ${spelling}, unread`, async () => {
        const result = await asMemberA({
          run_id: RUN_A,
          tenant_id: TENANT_A,
          [field]: value,
        });

        assertObjectMatch(result, { status: 400, reads: [], started: [] });
      });
    }
  }

  await t.step(
    "replays their own tenant's run as themselves, whatever user_id says",
    async () => {
      const result = await asMemberA({
        run_id: RUN_A,
        tenant_id: TENANT_A,
        user_id: MEMBER_B,
      });

      assertEquals(result.status, 200);
      assertEquals(result.started, [
        {
          agent_id: AGENT_A,
          goal: "weekly",
          context: {},
          tenant_id: TENANT_A,
          user_id: MEMBER_A,
          trigger_source: "replay",
          replay_of_run_id: RUN_A,
          max_steps: 12,
        },
      ]);
    },
  );
});

Deno.test("replay-agent-run: a service caller", async (t) => {
  await t.step("replays a run for the user it names", async () => {
    const result = await replay({
      token: SERVICE_KEY,
      body: { run_id: RUN_B, tenant_id: TENANT_B, user_id: MEMBER_B },
    });

    assertEquals(result.status, 200);
    assertObjectMatch(result.started[0] as Record<string, unknown>, {
      tenant_id: TENANT_B,
      user_id: MEMBER_B,
    });
  });

  await t.step("finds no run outside the tenant it names", async () => {
    const result = await replay({
      token: SERVICE_KEY,
      body: { run_id: RUN_B, tenant_id: TENANT_A },
    });

    assertObjectMatch(result, { status: 404, started: [] });
  });
});
