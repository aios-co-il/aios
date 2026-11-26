import { assertEquals, assertObjectMatch } from "jsr:@std/assert@1";

import {
  ANON_KEY,
  callRunFunction,
  type RunCall,
  SERVICE_KEY,
  TENANT_A,
  TENANT_B,
  TOKEN_A,
} from "../_shared/agent-runs/run-wrapper.test-fixture.ts";

const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_A = "a0000000-0000-4000-8000-00000000000a";
const FOREIGN_AGENT = "This agent belongs to another organization";

/** TENANT_A's waiting run, which names TENANT_B's agent. */
const TABLES = {
  ai_agents: [{ id: AGENT_B, tenant_id: TENANT_B }],
  agent_runs: [
    {
      id: RUN_A,
      tenant_id: TENANT_A,
      agent_id: AGENT_B,
      status: "waiting_approval",
    },
  ],
};

/** What run-ai-agent-v2 answers to one request. */
function run(call: RunCall) {
  return callRunFunction(new URL("./index.ts", import.meta.url), TABLES, call);
}

/** The run closed as failed because of its agent. */
const closedAsForeign = { status: "failed", error_message: FOREIGN_AGENT };

Deno.test("run-ai-agent-v2: no valid caller", async (t) => {
  for (const [who, token] of [
    ["a request with no token", null],
    ["the anon key", ANON_KEY],
  ] as const) {
    await t.step(
      `${who} is answered 401 before the body is parsed`,
      async () => {
        const result = await run({ token, body: "{not json" });

        assertObjectMatch(result, { status: 401, reads: [], writes: [] });
      },
    );
  }
});

Deno.test("run-ai-agent-v2: a signed-in user", async (t) => {
  await t.step("may not resume a run, which stays unread", async () => {
    const result = await run({
      token: TOKEN_A,
      body: { run_id: RUN_A, tenant_id: TENANT_A },
    });

    assertObjectMatch(result, { status: 403, reads: [], writes: [] });
  });
});

Deno.test("run-ai-agent-v2: an agent of another tenant", async (t) => {
  await t.step("is not started for a service caller", async () => {
    const result = await run({
      token: SERVICE_KEY,
      body: { agent_id: AGENT_B, goal: "weekly", tenant_id: TENANT_A },
    });
    const [inserted, closed] = result.writes;

    assertObjectMatch(result, {
      status: 403,
      reply: { error: FOREIGN_AGENT },
    });
    assertEquals(inserted.slice(0, 2), ["POST", "agent_runs"]);
    assertEquals(closed.slice(0, 2), ["PATCH", "agent_runs"]);
    assertObjectMatch(closed[2] as Record<string, unknown>, closedAsForeign);
    assertEquals(result.writes.length, 2);
  });

  await t.step("is not resumed for a service caller", async () => {
    const result = await run({
      token: SERVICE_KEY,
      body: { run_id: RUN_A, tenant_id: TENANT_A },
    });
    const closed = result.writes.at(-1);

    assertObjectMatch(result, {
      status: 403,
      reply: { error: FOREIGN_AGENT },
    });
    assertObjectMatch(closed?.[2] as Record<string, unknown>, closedAsForeign);
  });
});
