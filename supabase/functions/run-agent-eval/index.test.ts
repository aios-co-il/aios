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
const EVAL_A = "a0000000-0000-4000-8000-00000000000a";
const EVAL_B = "b0000000-0000-4000-8000-00000000000b";

/** One eval with one case per tenant. */
const TABLES = {
  agent_evals: [
    {
      id: EVAL_A,
      tenant_id: TENANT_A,
      agent_id: AGENT_A,
      dataset: [{ input: "question", expected: "answer" }],
      pass_threshold: 70,
    },
    {
      id: EVAL_B,
      tenant_id: TENANT_B,
      agent_id: AGENT_B,
      dataset: [{ input: "theirs", expected: "theirs" }],
      pass_threshold: 70,
    },
  ],
};

/** The judge's verdict on every case. */
function judged() {
  return Response.json({
    choices: [{ message: { content: '{"score":90,"reasoning":"close"}' } }],
  });
}

/** What run-agent-eval answers to one request. */
function runEval(call: RunCall) {
  const entry = new URL("./index.ts", import.meta.url);

  return callRunFunction(entry, TABLES, call, judged);
}

/** MEMBER_A running an eval under a tenant. */
function asMemberA(body: Record<string, unknown>) {
  return runEval({ token: TOKEN_A, body });
}

Deno.test("run-agent-eval: no valid caller", async (t) => {
  for (const [who, token] of [
    ["a request with no token", null],
    ["the anon key", ANON_KEY],
  ] as const) {
    await t.step(`${who} is answered 401 and starts nothing`, async () => {
      const result = await runEval({
        token,
        body: { eval_id: EVAL_B, tenant_id: TENANT_B },
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
    const result = await runEval({ token: null, body: "{not json" });

    assertEquals(result.status, 401);
  });
});

Deno.test("run-agent-eval: a signed-in user", async (t) => {
  await t.step("may not run an eval under another tenant", async () => {
    const result = await asMemberA({ eval_id: EVAL_B, tenant_id: TENANT_B });

    assertObjectMatch(result, {
      status: 403,
      reply: { error: "Not a member of this organization" },
      started: [],
      writes: [],
    });
    assertEquals(result.reads.includes("agent_evals"), false);
  });

  await t.step(
    "may not run another tenant's eval under their own tenant",
    async () => {
      const result = await asMemberA({ eval_id: EVAL_B, tenant_id: TENANT_A });

      assertObjectMatch(result, {
        status: 404,
        reply: { error: "eval not found" },
        started: [],
        writes: [],
      });
    },
  );

  for (const [field, id] of [
    ["tenant_id", TENANT_B],
    ["eval_id", EVAL_B],
  ] as const) {
    for (const [spelling, value] of otherSpellings(id)) {
      await t.step(`is refused the ${field} ${spelling}, unread`, async () => {
        const result = await asMemberA({
          eval_id: EVAL_A,
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
    "runs their own tenant's eval as themselves, whatever user_id says",
    async () => {
      const result = await asMemberA({
        eval_id: EVAL_A,
        tenant_id: TENANT_A,
        user_id: MEMBER_B,
      });

      assertObjectMatch(result, {
        status: 200,
        reply: { ok: true, passed: 1, total: 1 },
      });
      assertEquals(result.started, [
        {
          agent_id: AGENT_A,
          goal: "question",
          tenant_id: TENANT_A,
          user_id: MEMBER_A,
          trigger_source: "eval",
          max_steps: 6,
        },
      ]);
      assertObjectMatch(result.writes[0][2] as Record<string, unknown>, {
        tenant_id: TENANT_A,
        eval_id: EVAL_A,
      });
    },
  );
});

Deno.test("run-agent-eval: a service caller", async (t) => {
  await t.step("runs an eval for the user it names", async () => {
    const result = await runEval({
      token: SERVICE_KEY,
      body: { eval_id: EVAL_B, tenant_id: TENANT_B, user_id: MEMBER_B },
    });

    assertEquals(result.status, 200);
    assertObjectMatch(result.started[0] as Record<string, unknown>, {
      tenant_id: TENANT_B,
      user_id: MEMBER_B,
    });
  });

  await t.step("finds no eval outside the tenant it names", async () => {
    const result = await runEval({
      token: SERVICE_KEY,
      body: { eval_id: EVAL_B, tenant_id: TENANT_A },
    });

    assertObjectMatch(result, { status: 404, started: [], writes: [] });
  });
});
