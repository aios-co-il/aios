import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFileSync } from "node:fs";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { authorizeRunRequest, resumableRun } from "./run-access.ts";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const MEMBER_B = "44444444-4444-4444-8444-444444444444";
const AGENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RUN_A = "a0000000-0000-4000-8000-00000000000a";
const RUN_B = "b0000000-0000-4000-8000-00000000000b";
const SERVICE = { kind: "service" as const, userId: null };
const MALFORMED_IDS = "Invalid tenant_id or agent_id";
const RESUME_REFUSED = "Only an approved step resumes a run";

/** Each member belongs to their own tenant, which has one agent and one run waiting for approval. */
function db() {
  const waiting = { status: "waiting_approval" };

  return fakeSupabase({
    tenant_users: [
      { tenant_id: TENANT_A, user_id: MEMBER_A },
      { tenant_id: TENANT_B, user_id: MEMBER_B },
    ],
    ai_agents: [
      { id: AGENT_A, tenant_id: TENANT_A },
      { id: AGENT_B, tenant_id: TENANT_B },
    ],
    agent_runs: [
      { id: RUN_A, tenant_id: TENANT_A, user_id: MEMBER_A, ...waiting },
      { id: RUN_B, tenant_id: TENANT_B, user_id: MEMBER_B, ...waiting },
    ],
  });
}

/** What MEMBER_A is answered for a body, and the tables read to reach it. */
async function memberGate(body: Record<string, unknown>) {
  const sb = db();
  const gate = await authorizeRunRequest(
    sb,
    { kind: "user", userId: MEMBER_A },
    body,
  );

  return { gate, reads: sb.queries.map((query) => query.table) };
}

/** A new run of TENANT_A's agent, with the fields a caller may add. */
function newRun(over: Record<string, unknown> = {}) {
  return { tenant_id: TENANT_A, agent_id: AGENT_A, goal: "weekly", ...over };
}

/** The refusal the handler turns into a response. */
function refused(status: number, error: string) {
  return { ok: false, status, error };
}

Deno.test("authorizeRunRequest: a signed-in user starting a run", async (t) => {
  await t.step("refuses a tenant the user does not belong to", async () => {
    const { gate } = await memberGate(
      newRun({ tenant_id: TENANT_B, agent_id: AGENT_B }),
    );

    assertEquals(gate, refused(403, "Not a member of this organization"));
  });

  await t.step(
    "refuses another tenant's agent under their own tenant",
    async () => {
      const { gate } = await memberGate(newRun({ agent_id: AGENT_B }));

      assertEquals(
        gate,
        refused(403, "This agent belongs to another organization"),
      );
    },
  );

  for (const [spelling, id] of [
    ["in an array", [TENANT_B]],
    ["without hyphens", TENANT_B.replaceAll("-", "")],
    ["in braces", `{${TENANT_B}}`],
  ] as const) {
    await t.step(`refuses a tenant_id ${spelling}, unread`, async () => {
      const result = await memberGate(
        newRun({ tenant_id: id, agent_id: AGENT_B }),
      );

      assertEquals(result, { gate: refused(403, MALFORMED_IDS), reads: [] });
    });
  }

  for (const [spelling, id] of [
    ["in an array", [AGENT_B]],
    ["without hyphens", AGENT_B.replaceAll("-", "")],
    ["in braces", `{${AGENT_B}}`],
  ] as const) {
    await t.step(`refuses an agent_id ${spelling}, unread`, async () => {
      const result = await memberGate(newRun({ agent_id: id }));

      assertEquals(result, { gate: refused(403, MALFORMED_IDS), reads: [] });
    });
  }

  await t.step(
    "lets a member run their own tenant's agent, as themselves",
    async () => {
      const body = newRun({
        user_id: MEMBER_B,
        parent_run_id: RUN_B,
        replay_of_run_id: RUN_B,
        conversation_id: RUN_B,
      });
      const { gate } = await memberGate(body);

      assertEquals(gate, { ok: true });
      assertEquals(body, newRun({ user_id: MEMBER_A }));
    },
  );
});

Deno.test("authorizeRunRequest: a signed-in user resuming a run", async (t) => {
  for (const [whose, body] of [
    ["another tenant's run", { run_id: RUN_B, tenant_id: TENANT_B }],
    ["another tenant's run by id alone", { run_id: RUN_B }],
    ["another user's run id in an array", { run_id: [RUN_B] }],
    ["their own waiting run", { run_id: RUN_A, tenant_id: TENANT_A }],
  ] as const) {
    await t.step(`refuses ${whose}, unread`, async () => {
      const result = await memberGate({ ...body });

      assertEquals(result, { gate: refused(403, RESUME_REFUSED), reads: [] });
    });
  }
});

Deno.test("authorizeRunRequest: no valid caller", async (t) => {
  for (const [what, body] of [
    ["start a run", newRun()],
    ["resume a run", { run_id: RUN_A, tenant_id: TENANT_A }],
  ] as const) {
    await t.step(`may not ${what}, and nothing is read`, async () => {
      const sb = db();
      const gate = await authorizeRunRequest(sb, null, { ...body });

      assertEquals(gate, refused(401, "unauthorized"));
      assertEquals(sb.queries, []);
    });
  }
});

Deno.test("authorizeRunRequest: service callers", async (t) => {
  await t.step("start a run with the body as sent", async () => {
    const body = newRun({
      user_id: MEMBER_A,
      parent_run_id: RUN_A,
      replay_of_run_id: RUN_A,
      trigger_source: "replay",
    });
    const sent = structuredClone(body);
    const sb = db();

    assertEquals(await authorizeRunRequest(sb, SERVICE, body), { ok: true });
    assertEquals(body, sent);
    assertEquals(sb.queries, []);
  });

  await t.step("resume a run", async () => {
    const gate = await authorizeRunRequest(db(), SERVICE, {
      run_id: RUN_A,
      tenant_id: TENANT_A,
    });

    assertEquals(gate, { ok: true });
  });
});

Deno.test("resumableRun", async (t) => {
  await t.step("finds the run inside the tenant the caller names", async () => {
    const run = await resumableRun(db(), {
      run_id: RUN_A,
      tenant_id: TENANT_A,
    });

    assertStrictEquals(run?.id, RUN_A);
  });

  for (const [what, body] of [
    ["a run of another tenant", { run_id: RUN_B, tenant_id: TENANT_A }],
    ["a run named without its tenant", { run_id: RUN_A }],
    ["an unknown run", { run_id: TENANT_A, tenant_id: TENANT_A }],
  ] as const) {
    await t.step(`finds nothing for ${what}`, async () => {
      assertStrictEquals(await resumableRun(db(), { ...body }), null);
    });
  }
});

// The checks live in ./run-access.ts, so the handler must ask them before it touches a table.
Deno.test(
  "run-ai-agent-v2 authorizes the caller before any table is touched",
  () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const serve = source.slice(source.indexOf("Deno.serve(async (req) =>"));
    const gateAt = serve.indexOf("await authorizeRunRequest(");
    assert(gateAt > 0, "Deno.serve must call authorizeRunRequest");

    const before = serve.slice(0, gateAt);
    assertMatch(before, /const auth = await requireAuth\(req\);/);
    assertStrictEquals(before.includes(".from("), false);
    assertStrictEquals(before.includes("body."), false);
    assertMatch(
      serve.slice(gateAt),
      /^await authorizeRunRequest\(supabase, auth, body\);\s*if \(!gate\.ok\) \{\s*return jsonResponse\(\{ error: gate\.error \}, gate\.status\);\s*\}/,
    );

    // One auth call decides the whole request, and a resumed run is read through its tenant.
    assertStrictEquals(serve.split("requireAuth(").length, 2);
    assertMatch(serve, /await resumableRun\(supabase, body\)/);
    assertStrictEquals(
      /\.from\("agent_runs"\)\s*\.select\(/.test(serve),
      false,
    );
  },
);
