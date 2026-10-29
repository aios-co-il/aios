import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { fakeDb } from "../_shared/carmen/approvals/test-db.ts";
import { claimForRun, markApprovalFailed, rejectApproval } from "./decision.ts";

const ROW = {
  id: "row-1",
  tenant_id: "tenant-1",
  status: "pending",
  action_type: "fb_pause",
  tool_name: "fb_pause",
  expires_at: null,
};
const USER = "22222222-2222-4222-8222-222222222222";
const ok = (data: unknown) => ({ data, error: null });
const fail = { data: null, error: { message: "db down" } };

Deno.test("rejectApproval", async (t) => {
  await t.step("rejects an undecided row of the row's tenant", async () => {
    const { client, calls } = fakeDb({
      agent_approval_queue: [ok([{ id: "row-1" }])],
    });
    assertEquals(await rejectApproval(client, ROW, USER, "no"), {
      status: 200,
      body: { success: true, rejected: true, approval_id: "row-1" },
    });
    assertEquals(calls.slice(1, 4), [
      ["agent_approval_queue", "eq", "id", "row-1"],
      ["agent_approval_queue", "eq", "tenant_id", "tenant-1"],
      ["agent_approval_queue", "in", "status", ["pending", "approved"]],
    ]);
  });

  await t.step("a row decided meanwhile gets 409 not_pending", async () => {
    const { client } = fakeDb({ agent_approval_queue: [ok([])] });
    assertEquals(await rejectApproval(client, ROW, USER, null), {
      status: 409,
      body: { error: "not_pending", status: "pending" },
    });
  });

  await t.step(
    "a query error throws instead of reading as not_pending",
    async () => {
      const { client } = fakeDb({ agent_approval_queue: [fail] });
      await assertRejects(() => rejectApproval(client, ROW, USER, null));
    },
  );
});

Deno.test("claimForRun", async (t) => {
  await t.step(
    "a tool without an executor route gets 400 unknown_tool",
    async () => {
      const { client, calls } = fakeDb({});
      const row = { ...ROW, action_type: "code_fix", tool_name: "code_fix" };
      assertEquals(await claimForRun(client, row, USER), {
        reply: {
          status: 400,
          body: { error: "unknown_tool", tool_name: "code_fix" },
        },
      });
      assertEquals(calls, []);
    },
  );

  await t.step("an expired row is marked expired and gets 410", async () => {
    const { client, calls } = fakeDb({ agent_approval_queue: [ok(null)] });
    const row = { ...ROW, expires_at: "2020-01-01T00:00:00Z" };
    assertEquals(await claimForRun(client, row, USER), {
      reply: { status: 410, body: { error: "expired", approval_id: "row-1" } },
    });
    assertEquals((calls[0][2] as { status: string }).status, "expired");
  });

  await t.step("the caller that claims the row runs it", async () => {
    const claimed = { ...ROW, status: "executing" };
    const { client } = fakeDb({ agent_approval_queue: [ok([claimed])] });
    assertEquals(await claimForRun(client, ROW, USER), { claimed });
  });

  await t.step(
    "a lost race on an executed row reports already_executed",
    async () => {
      const { client } = fakeDb({
        agent_approval_queue: [
          ok([]),
          ok({ status: "executed", execution_result: { id: 7 } }),
        ],
      });
      assertEquals(await claimForRun(client, ROW, USER), {
        reply: {
          status: 200,
          body: { success: true, already_executed: true, result: { id: 7 } },
        },
      });
    },
  );

  await t.step("a row still running gets 409 in_progress", async () => {
    const { client } = fakeDb({
      agent_approval_queue: [
        ok([]),
        ok({ status: "executing", execution_result: null }),
      ],
    });
    assertEquals(await claimForRun(client, ROW, USER), {
      reply: {
        status: 409,
        body: {
          error: "in_progress",
          status: "executing",
          approval_id: "row-1",
        },
      },
    });
  });

  await t.step("a failed re-read throws", async () => {
    const { client } = fakeDb({ agent_approval_queue: [ok([]), fail] });
    await assertRejects(() => claimForRun(client, ROW, USER));
  });
});

Deno.test("markApprovalFailed", async (t) => {
  await t.step(
    "closes only the row this call claimed ('executing')",
    async () => {
      const { client, calls } = fakeDb({ agent_approval_queue: [ok(null)] });
      await markApprovalFailed(client, ROW, { error: "boom" });
      assertEquals(calls.slice(1), [
        ["agent_approval_queue", "eq", "id", "row-1"],
        ["agent_approval_queue", "eq", "tenant_id", "tenant-1"],
        ["agent_approval_queue", "eq", "status", "executing"],
      ]);
    },
  );

  await t.step("a failed update is logged, not thrown", async () => {
    const { client } = fakeDb({ agent_approval_queue: [fail] });
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logged.push(args);
    try {
      await markApprovalFailed(client, ROW, { error: "boom" });
    } finally {
      console.error = original;
    }

    assertEquals(logged, [
      ["[carmen-approval-execute] mark failed", fail.error],
    ]);
  });
});
