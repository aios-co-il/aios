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

const SUPERVISOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SUPERVISOR_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHILD_A = "a0000000-0000-4000-8000-00000000000a";
const CHILD_B = "b0000000-0000-4000-8000-00000000000b";
/** A second agent of TENANT_A, linked to SUPERVISOR_A only by TENANT_B. */
const CHILD_A2 = "a0000000-0000-4000-8000-0000000000a2";

/** A child link as the handler reads it, with the child agent embedded. */
function link(tenantId: string, supervisorId: string, child: string) {
  const childTenant = child === CHILD_B ? TENANT_B : TENANT_A;

  return {
    tenant_id: tenantId,
    supervisor_agent_id: supervisorId,
    child_agent_id: child,
    enabled: true,
    priority: 1,
    routing_hint: null,
    child: { id: child, name: child, tenant_id: childTenant },
  };
}

/**
 * One supervisor with one child per tenant. SUPERVISOR_A also has a link of
 * its own to TENANT_B's agent, and a link TENANT_B wrote to it.
 */
const TABLES = {
  ai_agents: [
    { id: SUPERVISOR_A, tenant_id: TENANT_A, name: "lead" },
    { id: SUPERVISOR_B, tenant_id: TENANT_B, name: "theirs" },
  ],
  agent_supervisors: [
    link(TENANT_A, SUPERVISOR_A, CHILD_A),
    link(TENANT_A, SUPERVISOR_A, CHILD_B),
    link(TENANT_B, SUPERVISOR_A, CHILD_A2),
    link(TENANT_B, SUPERVISOR_B, CHILD_B),
  ],
};

/** The router delegates to every agent a link names. */
function routed() {
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            delegations: [
              { agent_id: CHILD_A, sub_goal: "theirs to do" },
              { agent_id: CHILD_B, sub_goal: "not theirs" },
              { agent_id: CHILD_A2, sub_goal: "not linked by them" },
            ],
          }),
        },
      },
    ],
  });
}

/** What run-agent-supervisor answers to one request. */
function supervise(call: RunCall) {
  const entry = new URL("./index.ts", import.meta.url);

  return callRunFunction(entry, TABLES, call, routed);
}

/** MEMBER_A giving a supervisor a goal under a tenant. */
function asMemberA(body: Record<string, unknown>) {
  return supervise({
    token: TOKEN_A,
    body: { goal: "plan the week", ...body },
  });
}

Deno.test("run-agent-supervisor: no valid caller", async (t) => {
  for (const [who, token] of [
    ["a request with no token", null],
    ["the anon key", ANON_KEY],
  ] as const) {
    await t.step(`${who} is answered 401 and starts nothing`, async () => {
      const result = await supervise({
        token,
        body: {
          supervisor_agent_id: SUPERVISOR_B,
          goal: "plan",
          tenant_id: TENANT_B,
        },
      });

      assertObjectMatch(result, {
        status: 401,
        reads: [],
        started: [],
        writes: [],
      });
    });
  }

  await t.step("is answered 401 before the body is parsed", async () => {
    const result = await supervise({ token: null, body: "{not json" });

    assertEquals(result.status, 401);
  });
});

Deno.test("run-agent-supervisor: a signed-in user", async (t) => {
  await t.step("may not run a supervisor under another tenant", async () => {
    const result = await asMemberA({
      supervisor_agent_id: SUPERVISOR_B,
      tenant_id: TENANT_B,
    });

    assertObjectMatch(result, {
      status: 403,
      reply: { error: "Not a member of this organization" },
      started: [],
      writes: [],
    });
    assertEquals(result.reads.includes("agent_supervisors"), false);
  });

  await t.step(
    "may not run another tenant's supervisor under their own tenant",
    async () => {
      const result = await asMemberA({
        supervisor_agent_id: SUPERVISOR_B,
        tenant_id: TENANT_A,
      });

      assertObjectMatch(result, { status: 403, started: [], writes: [] });
      assertEquals(result.reads.includes("agent_supervisors"), false);
    },
  );

  for (const [field, id] of [
    ["tenant_id", TENANT_B],
    ["supervisor_agent_id", SUPERVISOR_B],
  ] as const) {
    for (const [spelling, value] of otherSpellings(id)) {
      await t.step(`is refused a ${field} ${spelling}, unread`, async () => {
        const result = await asMemberA({
          supervisor_agent_id: SUPERVISOR_A,
          tenant_id: TENANT_A,
          [field]: value,
        });

        assertObjectMatch(result, {
          status: 400,
          reads: [],
          started: [],
          writes: [],
        });
      });
    }
  }

  await t.step(
    "runs their own tenant's supervisor as themselves, delegating only through that tenant's links to its agents",
    async () => {
      const result = await asMemberA({
        supervisor_agent_id: SUPERVISOR_A,
        tenant_id: TENANT_A,
        user_id: MEMBER_B,
      });
      const [method, table, parentRun] = result.writes[0];
      const parentRunId = result.reply.parent_run_id;

      assertEquals(result.status, 200);
      assertEquals([method, table], ["POST", "agent_runs"]);
      assertObjectMatch(parentRun as Record<string, unknown>, {
        tenant_id: TENANT_A,
        agent_id: SUPERVISOR_A,
        user_id: MEMBER_A,
      });
      assertEquals(result.started, [
        {
          agent_id: CHILD_A,
          goal: "theirs to do",
          context: {},
          tenant_id: TENANT_A,
          user_id: MEMBER_A,
          parent_run_id: parentRunId,
          trigger_source: "supervisor_delegated",
        },
      ]);
      assertObjectMatch(result.reply, {
        delegations: [
          { agent_id: CHILD_A },
          { agent_id: CHILD_B, error: "child not authorized" },
          { agent_id: CHILD_A2, error: "child not authorized" },
        ],
      });
    },
  );
});

Deno.test("run-agent-supervisor: a service caller", async (t) => {
  await t.step("runs a supervisor for the user it names", async () => {
    const result = await supervise({
      token: SERVICE_KEY,
      body: {
        supervisor_agent_id: SUPERVISOR_B,
        goal: "plan",
        tenant_id: TENANT_B,
        user_id: MEMBER_B,
      },
    });

    assertEquals(result.status, 200);
    assertObjectMatch(result.writes[0][2] as Record<string, unknown>, {
      tenant_id: TENANT_B,
      user_id: MEMBER_B,
    });
    assertObjectMatch(result.started[0] as Record<string, unknown>, {
      agent_id: CHILD_B,
      tenant_id: TENANT_B,
      user_id: MEMBER_B,
    });
  });

  await t.step("finds no supervisor outside the tenant it names", async () => {
    const result = await supervise({
      token: SERVICE_KEY,
      body: {
        supervisor_agent_id: SUPERVISOR_B,
        goal: "plan",
        tenant_id: TENANT_A,
      },
    });

    assertObjectMatch(result, {
      status: 404,
      reply: { error: "supervisor agent not found" },
      started: [],
      writes: [],
    });
  });
});
